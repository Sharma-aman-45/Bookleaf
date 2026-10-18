import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/supabase/admin";
import { assertDb } from "@/lib/api/errors";
import { draftResponse } from "@/lib/ai/draft";
import { keywordCategory } from "@/lib/ai/fallback";
import type { Author, SessionUser } from "@/lib/domain/types";
import { getTicketDetail } from "./tickets";
import { listBooks } from "./books";

export interface DraftPayload {
  content: string;
  source: "ai" | "template";
  model: string | null;
  notice: string | null;
  cached: boolean;
  created_at: string;
}

export async function getDraft(user: SessionUser, ticketId: string, options: { force?: boolean; guidance?: string } = {}): Promise<DraftPayload> {
  const ticket = await getTicketDetail(user, ticketId);
  const category = ticket.category ?? keywordCategory(`${ticket.subject} ${ticket.description}`);
  const lastMessageId = ticket.messages.at(-1)?.id ?? "none";
  const contextHash = createHash("sha1")
    .update(["v2", category, lastMessageId, options.guidance ?? ""].join("|"))
    .digest("hex");

  if (!options.force) {
    const cached = assertDb(
      await db()
        .from("ai_drafts")
        .select("content, source, model, created_at")
        .eq("ticket_id", ticketId)
        .eq("context_hash", contextHash)
        .eq("source", "ai")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load cached draft"
    ) as { content: string; source: "ai"; model: string | null; created_at: string } | null;
    if (cached) return { ...cached, notice: null, cached: true };
  }

  const author = assertDb(
    await db().from("authors").select("name, bank_linked, country").eq("id", ticket.author_id).single(),
    "load author"
  ) as Pick<Author, "name" | "bank_linked" | "country">;

  const draft = await draftResponse({
    ticketId,
    ticketNumber: ticket.ticket_number,
    category,
    subject: ticket.subject,
    description: ticket.description,
    author,
    book: ticket.book_detail ?? null,
    authorBooks: ticket.book_detail ? [] : await listBooks(user, ticket.author_id),
    messages: ticket.messages,
    agentName: user.fullName,
    guidance: options.guidance
  });

  const createdAt = new Date().toISOString();
  if (draft.source === "ai") {
    const { error } = await db().from("ai_drafts").insert({
      ticket_id: ticketId,
      context_hash: contextHash,
      content: draft.content,
      source: draft.source,
      model: draft.model,
      created_by: user.id
    });
    if (error) console.warn("[drafts] cache write failed", error.message);
  }

  return { ...draft, cached: false, created_at: createdAt };
}
