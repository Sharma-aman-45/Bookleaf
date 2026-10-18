"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "@/hooks/useApi";
import { useRealtime } from "@/hooks/useRealtime";
import { useSession } from "@/components/SessionContext";
import { SourceChip, StatusBadge } from "@/components/Badges";
import { ErrorBanner, LoadingRows } from "@/components/EmptyState";
import { Thread } from "@/components/Thread";
import { api, patch, post, ApiClientError } from "@/lib/client/api";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketStatus
} from "@/lib/domain/constants";
import type { TicketDetail, TicketEvent } from "@/lib/domain/types";
import { ago, date, dateTime, inr, number, ticketRef } from "@/lib/format";

interface Draft {
  content: string;
  source: "ai" | "template";
  model: string | null;
  notice: string | null;
  cached: boolean;
  created_at: string;
}

function describeEvent(e: TicketEvent) {
  const who = e.actor?.full_name ?? "System";
  const label = (v: string | null) =>
    v && v in CATEGORY_LABELS
      ? CATEGORY_LABELS[v as keyof typeof CATEGORY_LABELS]
      : v && v in PRIORITY_LABELS
        ? PRIORITY_LABELS[v as keyof typeof PRIORITY_LABELS]
        : v && v in STATUS_LABELS
          ? STATUS_LABELS[v as keyof typeof STATUS_LABELS]
          : v ?? "none";
  switch (e.type) {
    case "created":
      return "Ticket raised by author";
    case "ai_classified":
    case "rule_classified": {
      const [c, p] = (e.to_value ?? "|").split("|");
      return `${e.type === "ai_classified" ? "AI" : "Keyword rules"} set ${label(c)}, ${label(p)}`;
    }
    case "status_changed":
      return `${who} moved status from ${label(e.from_value)} to ${label(e.to_value)}`;
    case "category_overridden":
      return `${who} changed category to ${label(e.to_value)}`;
    case "priority_overridden":
      return `${who} changed priority to ${label(e.to_value)}`;
    case "assigned":
      return e.to_value ? `${who} assigned it to ${e.to_value}` : `${who} unassigned the ticket`;
    case "replied":
      return `${who} replied`;
    case "replied_ai_assisted":
      return `${who} replied using the AI draft`;
    case "author_replied":
      return "Author replied";
    default:
      return e.type;
  }
}

export default function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useSession();
  const { data: ticket, error, loading, reload, setData } = useApi<TicketDetail>(`/tickets/${id}`);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [fromAi, setFromAi] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [nextStatus, setNextStatus] = useState<TicketStatus | "">("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [triageBusy, setTriageBusy] = useState(false);
  const draftForMessages = useRef<number | null>(null);

  const loadDraft = useCallback(
    async (force = false) => {
      setDraftLoading(true);
      try {
        const result = force
          ? await post<Draft>(`/tickets/${id}/draft`, guidance.trim() ? { guidance: guidance.trim() } : {})
          : await api<Draft>(`/tickets/${id}/draft`);
        setDraft(result);
        setReply(result.content);
        setFromAi(result.source === "ai");
      } catch (e) {
        setDraft({
          content: "",
          source: "template",
          model: null,
          notice: e instanceof ApiClientError ? `${e.message} Write the reply manually.` : "Draft unavailable. Write the reply manually.",
          cached: false,
          created_at: new Date().toISOString()
        });
      } finally {
        setDraftLoading(false);
      }
    },
    [id, guidance]
  );

  useEffect(() => {
    if (!ticket || draftForMessages.current !== null) return;
    draftForMessages.current = ticket.messages.length;
    if (ticket.status !== "closed") loadDraft(false);
  }, [ticket, loadDraft]);

  const live = useRealtime(
    `admin-ticket-${id}`,
    [
      { table: "tickets", filter: `id=eq.${id}`, event: "UPDATE" },
      { table: "ticket_messages", filter: `ticket_id=eq.${id}`, event: "INSERT" },
      { table: "internal_notes", filter: `ticket_id=eq.${id}`, event: "INSERT" }
    ],
    () => reload(true),
    15000
  );

  const staleDraft =
    ticket && draftForMessages.current !== null && ticket.messages.length > draftForMessages.current &&
    ticket.messages.at(-1)?.sender_role === "author";

  async function triage(body: Record<string, unknown>) {
    setTriageBusy(true);
    setNotice(null);
    try {
      const updated = await patch<TicketDetail>(`/tickets/${id}`, body);
      setData(updated);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiClientError ? e.message : "Update failed." });
    } finally {
      setTriageBusy(false);
    }
  }

  async function reclassify() {
    setTriageBusy(true);
    try {
      setData(await post<TicketDetail>(`/tickets/${id}/classify`));
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiClientError ? e.message : "Reclassification failed." });
    } finally {
      setTriageBusy(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (reply.trim().length < 2) return;
    setSending(true);
    setNotice(null);
    try {
      await post(`/tickets/${id}/messages`, {
        body: reply.trim(),
        ai_assisted: fromAi,
        ...(nextStatus ? { status: nextStatus } : {})
      });
      setReply("");
      setDraft(null);
      setFromAi(false);
      setNextStatus("");
      draftForMessages.current = (ticket?.messages.length ?? 0) + 1;
      await reload(true);
      setNotice({ kind: "ok", text: "Reply sent. The author sees it on their ticket right away." });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiClientError ? e.message : "Reply was not sent." });
    } finally {
      setSending(false);
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (note.trim().length < 2) return;
    setSavingNote(true);
    try {
      await post(`/tickets/${id}/notes`, { body: note.trim() });
      setNote("");
      await reload(true);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiClientError ? e.message : "Note was not saved." });
    } finally {
      setSavingNote(false);
    }
  }

  if (error) return <ErrorBanner message={error.status === 404 ? "Ticket not found." : error.message} />;
  if (loading || !ticket) return <LoadingRows count={4} />;

  const book = ticket.book_detail;
  const mine = ticket.assigned_to === user.id;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/admin" className="btn btn-quiet btn-sm">
            Back to queue
          </Link>
          <h1 style={{ marginTop: "0.4rem" }}>{ticket.subject}</h1>
          <div className="ticket-row-meta" style={{ marginTop: "0.5rem" }}>
            <span className="num">{ticketRef(ticket.ticket_number)}</span>
            <span>{ticket.author?.name}</span>
            <span>Opened {dateTime(ticket.created_at)} ({ago(ticket.created_at)})</span>
          </div>
        </div>
        <div className="row">
          <span className="live-dot" data-live={live}>
            {live ? "Live" : "Connecting…"}
          </span>
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      {notice && (
        <div className={`banner ${notice.kind === "ok" ? "banner-ok" : "banner-error"}`} style={{ marginBottom: "1rem" }} role="status">
          {notice.text}
        </div>
      )}

      <div className="detail-grid">
        <div className="stack">
          <Thread
            viewer="admin"
            original={{ authorName: ticket.author?.name ?? "Author", body: ticket.description, createdAt: ticket.created_at }}
            messages={ticket.messages}
          />

          {ticket.status === "closed" ? (
            <div className="banner">This ticket is closed. Reopen it from the status menu to reply.</div>
          ) : (
            <form className="draft" onSubmit={sendReply}>
              <div className="draft-head">
                <div className="row">
                  <h3 style={{ margin: 0 }}>Reply</h3>
                  {draft?.source === "ai" && (
                    <span className="source-chip" title={draft.model ?? undefined}>
                      AI draft{draft.cached ? ", cached" : ""}
                    </span>
                  )}
                  {draft?.source === "template" && draft.content && <span className="source-chip">Policy template</span>}
                </div>
                <div className="row">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadDraft(true)} disabled={draftLoading}>
                    {draftLoading ? "Drafting…" : draft ? "Regenerate draft" : "Generate draft"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setReply("");
                      setFromAi(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {draft?.notice && <div className="banner banner-warn">{draft.notice}</div>}
              {staleDraft && (
                <div className="banner banner-warn row row-between">
                  <span>The author added a message after this draft was written.</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { draftForMessages.current = ticket.messages.length; loadDraft(true); }}>
                    Update draft
                  </button>
                </div>
              )}

              <label className="field">
                <span className="faint">Optional instruction for the next draft</span>
                <input
                  className="input"
                  value={guidance}
                  maxLength={300}
                  placeholder="For example: shorter, mention the payout date, ask for bank details"
                  onChange={(e) => setGuidance(e.target.value)}
                />
              </label>

              {draftLoading && !reply ? (
                <div className="skeleton" style={{ minHeight: 260 }} />
              ) : (
                <textarea
                  className="textarea"
                  value={reply}
                  maxLength={5000}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply to the author."
                  aria-label="Reply to author"
                />
              )}

              <div className="row row-between">
                <label className="row" style={{ gap: "0.4rem" }}>
                  <span className="faint">After sending</span>
                  <select className="select" style={{ width: "auto" }} value={nextStatus} onChange={(e) => setNextStatus(e.target.value as TicketStatus | "")}>
                    <option value="">{ticket.status === "open" ? "Move to In Progress" : `Keep ${STATUS_LABELS[ticket.status]}`}</option>
                    <option value="resolved">Mark Resolved</option>
                    <option value="in_progress">Set In Progress</option>
                  </select>
                </label>
                <button className="btn btn-primary" disabled={sending || reply.trim().length < 2}>
                  {sending ? "Sending…" : "Send to author"}
                </button>
              </div>
            </form>
          )}

          <section className="panel">
            <h3>Internal notes</h3>
            <p className="faint" style={{ marginBottom: "0.7rem" }}>Only the BookLeaf team can see these.</p>
            <div className="stack" style={{ gap: "0.5rem", marginBottom: "0.8rem" }}>
              {ticket.notes?.length ? (
                ticket.notes.map((n) => (
                  <div key={n.id} className="note">
                    <header>
                      {n.admin?.full_name ?? "Admin"}, {dateTime(n.created_at)}
                    </header>
                    <div className="msg-body">{n.body}</div>
                  </div>
                ))
              ) : (
                <span className="muted">No notes yet.</span>
              )}
            </div>
            <form className="row" onSubmit={addNote}>
              <input
                className="input"
                style={{ flex: 1 }}
                value={note}
                maxLength={3000}
                placeholder="Add context for the team"
                onChange={(e) => setNote(e.target.value)}
              />
              <button className="btn btn-ghost btn-sm" disabled={savingNote || note.trim().length < 2}>
                {savingNote ? "Saving…" : "Add note"}
              </button>
            </form>
          </section>
        </div>

        <aside className="stack">
          <section className="panel panel-cream stack" style={{ gap: "0.8rem" }}>
            <div className="row row-between">
              <h3 style={{ margin: 0 }}>Triage</h3>
              {mine ? (
                <button className="btn btn-quiet btn-sm" disabled={triageBusy} onClick={() => triage({ assigned_to: null })}>
                  Unassign me
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" disabled={triageBusy} onClick={() => triage({ assigned_to: "me" })}>
                  Assign to me
                </button>
              )}
            </div>
            <span className="faint">Owner: {ticket.assignee?.full_name ?? "Unassigned"}</span>

            <label className="field">
              <span>Status</span>
              <select className="select" value={ticket.status} disabled={triageBusy} onChange={(e) => triage({ status: e.target.value })}>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="row">
                Category <SourceChip source={ticket.category_source} />
              </span>
              <select className="select" value={ticket.category ?? ""} disabled={triageBusy} onChange={(e) => triage({ category: e.target.value })}>
                {!ticket.category && <option value="">Classifying…</option>}
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="row">
                Priority <SourceChip source={ticket.priority_source} />
              </span>
              <select className="select" value={ticket.priority} disabled={triageBusy} onChange={(e) => triage({ priority: e.target.value })}>
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </label>

            {ticket.ai_reasoning && (
              <p className="helper">
                {ticket.ai_reasoning}
                {ticket.ai_confidence !== null && ` Confidence ${Math.round(Number(ticket.ai_confidence) * 100)}%.`}
              </p>
            )}
            <button className="btn btn-quiet btn-sm" style={{ justifySelf: "start" }} disabled={triageBusy} onClick={reclassify}>
              Run classification again
            </button>
          </section>

          <section className="panel">
            <h3>{ticket.author?.name}</h3>
            <p className="faint" style={{ marginBottom: "0.7rem" }}>{ticket.author?.email}</p>
            {book ? (
              <>
                <h3 style={{ fontSize: "1rem" }}>{book.title}</h3>
                <dl className="kv">
                  <dt>Status</dt>
                  <dd>{book.status}</dd>
                  <dt>ISBN</dt>
                  <dd>{book.isbn ?? "Pending"}</dd>
                  <dt>Published</dt>
                  <dd>{date(book.publication_date)}</dd>
                  <dt>MRP</dt>
                  <dd>{inr(book.mrp)}</dd>
                  <dt>Copies sold</dt>
                  <dd>{number(book.total_copies_sold)}</dd>
                  <dt>Royalty earned</dt>
                  <dd>{inr(book.total_royalty_earned)}</dd>
                  <dt>Paid</dt>
                  <dd>{inr(book.royalty_paid)}</dd>
                  <dt>Pending</dt>
                  <dd>{inr(book.royalty_pending)}</dd>
                  {book.last_payout_date && (
                    <>
                      <dt>Last payout</dt>
                      <dd>{date(book.last_payout_date)}</dd>
                    </>
                  )}
                </dl>
              </>
            ) : (
              <span className="muted">General or account-level question.</span>
            )}
          </section>

          {ticket.attachment && (
            <section className="panel">
              <h3>Attachment</h3>
              {ticket.attachment.url ? (
                <a href={ticket.attachment.url} target="_blank" rel="noreferrer">
                  {ticket.attachment.name}
                </a>
              ) : (
                <span className="muted">{ticket.attachment.name}</span>
              )}
            </section>
          )}

          <section className="panel">
            <h3>Activity</h3>
            <ol className="timeline">
              {ticket.events?.map((e) => (
                <li key={e.id}>
                  <span>
                    {describeEvent(e)}
                    <span className="faint"> {ago(e.created_at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
