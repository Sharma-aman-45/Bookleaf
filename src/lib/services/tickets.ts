import "server-only";
import { db } from "@/lib/supabase/admin";
import { ApiError, assertDb } from "@/lib/api/errors";
import type { CreateTicketInput, TicketQuery, UpdateTicketInput } from "@/lib/api/schemas";
import { classifyTicket } from "@/lib/ai/classify";
import { ATTACHMENT_BUCKET, type TicketStatus } from "@/lib/domain/constants";
import type {
  InternalNote,
  SessionUser,
  Ticket,
  TicketDetail,
  TicketEvent,
  TicketListItem,
  TicketMessage
} from "@/lib/domain/types";
import { getBookById } from "./books";

const LIST_SELECT =
  "*, author:authors(id, name, email), book:books(id, title, isbn), assignee:profiles!tickets_assigned_to_fkey(id, full_name)";

function cleanSearch(q: string) {
  return q.replace(/[,()%*\\]/g, " ").trim();
}

export async function listTickets(user: SessionUser, query: TicketQuery) {
  let q = db().from("tickets").select(LIST_SELECT, { count: "exact" });

  if (user.role === "author") q = q.eq("author_id", user.authorId!);
  else if (query.author_id) q = q.eq("author_id", query.author_id);

  if (query.status.length) q = q.in("status", query.status);
  if (query.category.length) q = q.in("category", query.category);
  if (query.priority.length) q = q.in("priority", query.priority);
  if (user.role === "admin" && query.assigned === "me") q = q.eq("assigned_to", user.id);
  if (user.role === "admin" && query.assigned === "unassigned") q = q.is("assigned_to", null);
  if (query.from) q = q.gte("created_at", `${query.from}T00:00:00Z`);
  if (query.to) q = q.lte("created_at", `${query.to}T23:59:59Z`);

  if (query.q) {
    const term = cleanSearch(query.q);
    const numberMatch = term.match(/^(?:bl-?)?(\d+)$/i);
    if (numberMatch) q = q.eq("ticket_number", Number(numberMatch[1]));
    else if (term) q = q.or(`subject.ilike.%${term}%,description.ilike.%${term}%`);
  }

  if (query.sort === "urgency") q = q.order("priority", { ascending: true }).order("created_at", { ascending: true });
  if (query.sort === "oldest") q = q.order("created_at", { ascending: true });
  if (query.sort === "newest") q = q.order("created_at", { ascending: false });
  if (query.sort === "activity") q = q.order("last_activity_at", { ascending: false });

  const result = await q.range(query.offset, query.offset + query.limit - 1);
  const rows = assertDb(result, "load tickets") as TicketListItem[];
  return { items: rows, total: result.count ?? rows.length, limit: query.limit, offset: query.offset };
}

async function loadTicketRow(id: string): Promise<TicketListItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = assertDb(await db().from("tickets").select(LIST_SELECT).eq("id", id).maybeSingle(), "load ticket");
  return (row as TicketListItem | null) ?? null;
}

export async function requireTicket(user: SessionUser, id: string): Promise<TicketListItem> {
  const ticket = await loadTicketRow(id);
  if (!ticket || (user.role === "author" && ticket.author_id !== user.authorId)) throw ApiError.notFound("Ticket");
  return ticket;
}

async function recordEvent(ticketId: string, actorId: string | null, type: string, from?: string | null, to?: string | null) {
  const { error } = await db()
    .from("ticket_events")
    .insert({ ticket_id: ticketId, actor_id: actorId, type, from_value: from ?? null, to_value: to ?? null });
  if (error) console.warn("[tickets] event log failed", error.message);
}

export async function runClassification(ticketId: string) {
  const ticket = await loadTicketRow(ticketId);
  if (!ticket) return;
  const book = ticket.book_id ? await getBookById(ticket.book_id) : null;
  const result = await classifyTicket({
    ticketId,
    subject: ticket.subject,
    description: ticket.description,
    bookStatus: book?.status ?? null
  });

  const update: Partial<Ticket> = { ai_confidence: result.confidence, ai_reasoning: result.reasoning };
  if (ticket.category_source !== "admin") {
    update.category = result.category;
    update.category_source = result.source;
  }
  if (ticket.priority_source !== "admin") {
    update.priority = result.priority;
    update.priority_source = result.source;
  }

  const { error } = await db().from("tickets").update(update).eq("id", ticketId);
  if (error) {
    console.error("[tickets] classification update failed", error.message);
    return;
  }
  await recordEvent(ticketId, null, result.source === "ai" ? "ai_classified" : "rule_classified", null, `${result.category}|${result.priority}`);
}

export async function createTicket(user: SessionUser, input: CreateTicketInput): Promise<Ticket> {
  if (user.role !== "author" || !user.authorId) throw ApiError.forbidden("Only authors can raise support tickets.");

  if (input.book_id) {
    const book = await getBookById(input.book_id);
    if (!book || book.author_id !== user.authorId) {
      throw new ApiError(422, "VALIDATION_ERROR", "Choose one of your own books.", [
        { field: "book_id", message: "This book is not on your account." }
      ]);
    }
  }

  if (input.attachment && !input.attachment.path.startsWith(`${user.authorId}/`)) {
    throw new ApiError(422, "VALIDATION_ERROR", "Attachment is not valid.", [
      { field: "attachment", message: "Upload the file again before submitting." }
    ]);
  }

  const created = assertDb(
    await db()
      .from("tickets")
      .insert({
        author_id: user.authorId,
        book_id: input.book_id ?? null,
        subject: input.subject,
        description: input.description,
        attachment: input.attachment ?? null,
        last_reply_by: "author"
      })
      .select("*")
      .single(),
    "create ticket"
  ) as Ticket;

  await recordEvent(created.id, user.id, "created");
  return created;
}

async function signedAttachment(ticket: TicketListItem) {
  if (!ticket.attachment?.path) return ticket.attachment;
  const { data } = await db().storage.from(ATTACHMENT_BUCKET).createSignedUrl(ticket.attachment.path, 3600);
  return { ...ticket.attachment, url: data?.signedUrl ?? null };
}

export async function getTicketDetail(user: SessionUser, id: string): Promise<TicketDetail> {
  const ticket = await requireTicket(user, id);
  const client = db();

  const messages = assertDb(
    await client
      .from("ticket_messages")
      .select("*, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    "load messages"
  ) as TicketMessage[];

  const detail: TicketDetail = {
    ...ticket,
    attachment: await signedAttachment(ticket),
    messages,
    book_detail: ticket.book_id ? await getBookById(ticket.book_id) : null
  };

  if (user.role === "admin") {
    const [notes, events] = await Promise.all([
      client
        .from("internal_notes")
        .select("*, admin:profiles!internal_notes_admin_id_fkey(full_name)")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
      client
        .from("ticket_events")
        .select("*, actor:profiles!ticket_events_actor_id_fkey(full_name)")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true })
    ]);
    detail.notes = assertDb(notes, "load notes") as InternalNote[];
    detail.events = assertDb(events, "load activity") as TicketEvent[];
  } else {
    detail.ai_reasoning = null;
    detail.ai_confidence = null;
    detail.assigned_to = null;
    detail.assignee = null;
  }

  return detail;
}

function statusPatch(next: TicketStatus, current: Ticket) {
  const patch: Partial<Ticket> = { status: next };
  if ((next === "resolved" || next === "closed") && !current.resolved_at) patch.resolved_at = new Date().toISOString();
  if (next === "open" || next === "in_progress") patch.resolved_at = null;
  return patch;
}

export async function updateTicket(user: SessionUser, id: string, input: UpdateTicketInput) {
  const ticket = await requireTicket(user, id);
  const patch: Partial<Ticket> = {};
  const events: [string, string | null, string | null][] = [];

  if (input.status && input.status !== ticket.status) {
    Object.assign(patch, statusPatch(input.status, ticket));
    events.push(["status_changed", ticket.status, input.status]);
  }
  if (input.category && (input.category !== ticket.category || ticket.category_source !== "admin")) {
    patch.category = input.category;
    patch.category_source = "admin";
    if (input.category !== ticket.category) events.push(["category_overridden", ticket.category, input.category]);
  }
  if (input.priority && (input.priority !== ticket.priority || ticket.priority_source !== "admin")) {
    patch.priority = input.priority;
    patch.priority_source = "admin";
    if (input.priority !== ticket.priority) events.push(["priority_overridden", ticket.priority, input.priority]);
  }
  if (input.assigned_to !== undefined) {
    const target = input.assigned_to === "me" ? user.id : input.assigned_to;
    let targetName: string | null = null;
    if (target) {
      const admin = assertDb(
        await db().from("profiles").select("id, role, full_name").eq("id", target).maybeSingle(),
        "check assignee"
      ) as { role: string; full_name: string } | null;
      if (!admin || admin.role !== "admin") throw ApiError.badRequest("Tickets can only be assigned to admins.");
      targetName = admin.full_name;
    }
    if (target !== ticket.assigned_to) {
      patch.assigned_to = target;
      events.push(["assigned", ticket.assignee?.full_name ?? null, targetName]);
    }
  }

  if (Object.keys(patch).length === 0) return getTicketDetail(user, id);

  assertDb(await db().from("tickets").update(patch).eq("id", id).select("id").single(), "update ticket");
  await Promise.all(events.map(([type, from, to]) => recordEvent(id, user.id, type, from, to)));
  return getTicketDetail(user, id);
}

export async function addMessage(
  user: SessionUser,
  id: string,
  input: { body: string; ai_assisted?: boolean; status?: TicketStatus }
) {
  const ticket = await requireTicket(user, id);
  if (user.role === "author" && ticket.status === "closed") {
    throw ApiError.conflict("This ticket is closed. Raise a new ticket if you still need help.");
  }

  const message = assertDb(
    await db()
      .from("ticket_messages")
      .insert({
        ticket_id: id,
        sender_id: user.id,
        sender_role: user.role,
        body: input.body,
        ai_assisted: user.role === "admin" ? Boolean(input.ai_assisted) : false
      })
      .select("*, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
      .single(),
    "send message"
  ) as TicketMessage;

  const now = new Date().toISOString();
  const patch: Partial<Ticket> = { last_reply_by: user.role, last_activity_at: now };

  if (user.role === "admin") {
    if (!ticket.first_response_at) patch.first_response_at = now;
    if (!ticket.assigned_to) patch.assigned_to = user.id;
    const nextStatus = input.status ?? (ticket.status === "open" ? "in_progress" : ticket.status);
    if (nextStatus !== ticket.status) Object.assign(patch, statusPatch(nextStatus, ticket));
  } else if (ticket.status === "resolved") {
    Object.assign(patch, statusPatch("open", ticket));
  }

  assertDb(await db().from("tickets").update(patch).eq("id", id).select("id").single(), "update ticket activity");
  await recordEvent(id, user.id, user.role === "admin" ? (input.ai_assisted ? "replied_ai_assisted" : "replied") : "author_replied");
  if (patch.status && patch.status !== ticket.status) await recordEvent(id, user.id, "status_changed", ticket.status, patch.status);

  return message;
}

export async function addNote(user: SessionUser, id: string, body: string) {
  await requireTicket(user, id);
  return assertDb(
    await db()
      .from("internal_notes")
      .insert({ ticket_id: id, admin_id: user.id, body })
      .select("*, admin:profiles!internal_notes_admin_id_fkey(full_name)")
      .single(),
    "save note"
  ) as InternalNote;
}

export async function listNotes(user: SessionUser, id: string) {
  await requireTicket(user, id);
  return assertDb(
    await db()
      .from("internal_notes")
      .select("*, admin:profiles!internal_notes_admin_id_fkey(full_name)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    "load notes"
  ) as InternalNote[];
}
