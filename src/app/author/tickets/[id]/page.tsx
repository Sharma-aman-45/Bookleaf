"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useRealtime } from "@/hooks/useRealtime";
import { useSession } from "@/components/SessionContext";
import { CategoryTag, StatusBadge } from "@/components/Badges";
import { ErrorBanner, LoadingRows } from "@/components/EmptyState";
import { Thread } from "@/components/Thread";
import { post, ApiClientError } from "@/lib/client/api";
import { STATUS_LABELS, TICKET_STATUSES } from "@/lib/domain/constants";
import type { TicketDetail } from "@/lib/domain/types";
import { dateTime, ticketRef } from "@/lib/format";

export default function AuthorTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const user = useSession();
  const { data: ticket, error, loading, reload } = useApi<TicketDetail>(`/tickets/${id}`);
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticket) return;
    const ids = new Set(ticket.messages.map((m) => m.id));
    if (known.current) {
      const added = [...ids].filter((x) => !known.current!.has(x));
      if (added.length) setFresh(new Set(added));
    }
    known.current = ids;
  }, [ticket]);

  const live = useRealtime(
    `author-ticket-${id}`,
    [
      { table: "ticket_messages", filter: `ticket_id=eq.${id}`, event: "INSERT" },
      { table: "tickets", filter: `id=eq.${id}`, event: "UPDATE" }
    ],
    () => reload(true),
    15000
  );

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (reply.trim().length < 2) return;
    setSending(true);
    setReplyError(null);
    try {
      await post(`/tickets/${id}/messages`, { body: reply });
      setReply("");
      await reload(true);
    } catch (e) {
      setReplyError(e instanceof ApiClientError ? e.message : "Your reply was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (error) return <ErrorBanner message={error.status === 404 ? "This ticket does not exist or is not on your account." : error.message} />;
  if (loading || !ticket) return <LoadingRows count={3} />;

  const stepIndex = TICKET_STATUSES.indexOf(ticket.status);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/author/tickets" className="btn btn-quiet btn-sm">
            Back to my tickets
          </Link>
          <h1 style={{ marginTop: "0.4rem" }}>{ticket.subject}</h1>
          <div className="ticket-row-meta" style={{ marginTop: "0.5rem" }}>
            <span className="num">{ticketRef(ticket.ticket_number)}</span>
            <span>{ticket.book?.title ?? "General / account"}</span>
            <span>Opened {dateTime(ticket.created_at)}</span>
            {ticket.category && <CategoryTag category={ticket.category} />}
          </div>
        </div>
        <div className="row">
          <span className="live-dot" data-live={live}>
            {live ? "Live" : "Connecting…"}
          </span>
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      {search.get("created") && ticket.messages.length === 0 && (
        <div className="banner banner-ok" style={{ marginBottom: "1rem" }}>
          Ticket received. Our author support team will reply here, and this page updates on its own when they do.
        </div>
      )}

      <div className="detail-grid">
        <div className="stack">
          <Thread
            viewer="author"
            original={{ authorName: user.fullName, body: ticket.description, createdAt: ticket.created_at }}
            messages={ticket.messages}
            freshIds={fresh}
          />

          {ticket.status === "closed" ? (
            <div className="banner">
              This ticket is closed. <Link href="/author/tickets/new">Raise a new ticket</Link> if you still need help.
            </div>
          ) : (
            <form className="panel stack" onSubmit={sendReply}>
              <label className="field">
                <span>Reply to BookLeaf</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 110 }}
                  value={reply}
                  maxLength={5000}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={ticket.status === "resolved" ? "Replying will reopen this ticket." : "Add more detail or answer a question from the team."}
                />
              </label>
              {replyError && <span className="field-error">{replyError}</span>}
              <div>
                <button className="btn btn-primary" disabled={sending || reply.trim().length < 2}>
                  {sending ? "Sending…" : "Send reply"}
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="stack">
          <section className="panel panel-cream">
            <h3>Progress</h3>
            <ol className="timeline">
              {TICKET_STATUSES.map((s, i) => (
                <li key={s} style={{ opacity: i <= stepIndex ? 1 : 0.45 }}>
                  <span>
                    <strong>{STATUS_LABELS[s]}</strong>
                    {s === "open" && <span className="faint"> {dateTime(ticket.created_at)}</span>}
                    {s === "in_progress" && ticket.first_response_at && <span className="faint"> {dateTime(ticket.first_response_at)}</span>}
                    {s === "resolved" && ticket.resolved_at && <span className="faint"> {dateTime(ticket.resolved_at)}</span>}
                  </span>
                </li>
              ))}
            </ol>
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

          {ticket.book_detail && (
            <section className="panel">
              <h3>{ticket.book_detail.title}</h3>
              <dl className="kv">
                <dt>Status</dt>
                <dd>{ticket.book_detail.status}</dd>
                <dt>ISBN</dt>
                <dd>{ticket.book_detail.isbn ?? "Pending"}</dd>
              </dl>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
