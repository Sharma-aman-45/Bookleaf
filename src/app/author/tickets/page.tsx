"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { useRealtime } from "@/hooks/useRealtime";
import { useSession } from "@/components/SessionContext";
import { CategoryTag, StatusBadge } from "@/components/Badges";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/EmptyState";
import { STATUS_LABELS, TICKET_STATUSES, type TicketStatus } from "@/lib/domain/constants";
import type { TicketListItem } from "@/lib/domain/types";
import { ago, ticketRef } from "@/lib/format";

export default function MyTicketsPage() {
  const user = useSession();
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const { data, error, loading, reload } = useApi<{ items: TicketListItem[] }>("/tickets?sort=activity&limit=100");

  const live = useRealtime(
    `author-tickets-${user.authorId}`,
    [{ table: "tickets", filter: `author_id=eq.${user.authorId}` }],
    () => reload(true)
  );

  const counts = useMemo(() => {
    const base = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
    data?.items.forEach((t) => (base[t.status] += 1));
    return base;
  }, [data]);

  const items = (data?.items ?? []).filter((t) => filter === "all" || t.status === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My tickets</h1>
          <p>Replies from the BookLeaf team appear here as soon as they are sent.</p>
        </div>
        <div className="row">
          <span className="live-dot" data-live={live}>
            {live ? "Live updates on" : "Connecting…"}
          </span>
          <Link className="btn btn-primary" href="/author/tickets/new">
            Ask a question
          </Link>
        </div>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          All<span className="count">{data?.items.length ?? 0}</span>
        </button>
        {TICKET_STATUSES.map((s) => (
          <button key={s} className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {STATUS_LABELS[s]}
            <span className="count">{counts[s]}</span>
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error.message} onRetry={() => reload()} />}
      {loading && !data && <LoadingRows />}

      {data && items.length === 0 && (
        <EmptyState
          title={filter === "all" ? "You haven't raised any tickets" : `No ${STATUS_LABELS[filter as TicketStatus].toLowerCase()} tickets`}
          body="Questions about royalties, ISBNs, print quality, listings or production go straight to our author support team."
          action={<Link className="btn btn-primary" href="/author/tickets/new">Ask a question</Link>}
        />
      )}

      {items.length > 0 && (
        <div className="ticket-list">
          {items.map((t) => (
            <Link key={t.id} href={`/author/tickets/${t.id}`} className="ticket-row" data-priority="low">
              <span className="spine" aria-hidden />
              <div className="ticket-row-body">
                <strong>{t.subject}</strong>
                <div className="ticket-row-meta">
                  <span className="num">{ticketRef(t.ticket_number)}</span>
                  <span>{t.book?.title ?? "General / account"}</span>
                  {t.category && <CategoryTag category={t.category} />}
                </div>
              </div>
              <div className="ticket-row-side">
                <StatusBadge status={t.status} />
                {t.last_reply_by === "admin" && t.status !== "closed" ? (
                  <span className="reply-dot">BookLeaf replied {ago(t.last_activity_at)}</span>
                ) : (
                  <span>Updated {ago(t.last_activity_at)}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
