"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { useRealtime } from "@/hooks/useRealtime";
import { CategoryTag, PriorityMark, SourceChip, StatusBadge } from "@/components/Badges";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/EmptyState";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  RESPONSE_TARGET_HOURS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES
} from "@/lib/domain/constants";
import type { TicketListItem } from "@/lib/domain/types";
import { ago, hoursSince, ticketRef } from "@/lib/format";

interface Stats {
  open: number;
  in_progress: number;
  resolved: number;
  critical_active: number;
  unassigned_active: number;
  mine_active: number;
  awaiting_first_response_overdue: number;
}

interface Filters {
  status: string;
  category: string;
  priority: string;
  assigned: string;
  from: string;
  to: string;
  q: string;
  sort: string;
}

const DEFAULTS: Filters = {
  status: "open,in_progress",
  category: "",
  priority: "",
  assigned: "any",
  from: "",
  to: "",
  q: "",
  sort: "urgency"
};

function isOverdue(t: TicketListItem, now: number) {
  if (t.first_response_at || t.status === "resolved" || t.status === "closed") return false;
  return hoursSince(t.created_at, now) > RESPONSE_TARGET_HOURS[t.priority];
}

export default function QueuePage() {
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [search, setSearch] = useState("");
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    p.set("limit", "100");
    return `/tickets?${p.toString()}`;
  }, [filters]);

  const list = useApi<{ items: TicketListItem[]; total: number }>(query);
  const stats = useApi<Stats>("/admin/stats");

  const live = useRealtime("admin-queue", [{ table: "tickets" }], (payload) => {
    if (payload?.eventType === "INSERT" && payload.new && "id" in payload.new) {
      setFresh((prev) => new Set(prev).add(String(payload.new.id)));
    }
    list.reload(true);
    stats.reload(true);
  });

  const set = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const now = Date.now();
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULTS);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ticket queue</h1>
          <p>Sorted by urgency: critical first, then oldest within each priority. Rows marked late have waited past their first-response target.</p>
        </div>
        <span className="live-dot" data-live={live}>
          {live ? "Live" : "Connecting…"}
        </span>
      </div>

      {stats.data && (
        <dl className="ledger">
          <div>
            <dt>Open</dt>
            <dd>{stats.data.open}</dd>
          </div>
          <div>
            <dt>In progress</dt>
            <dd>{stats.data.in_progress}</dd>
          </div>
          <div>
            <dt>Critical, active</dt>
            <dd style={{ color: stats.data.critical_active ? "var(--p-critical)" : undefined }}>{stats.data.critical_active}</dd>
          </div>
          <div>
            <dt>Unassigned</dt>
            <dd>{stats.data.unassigned_active}</dd>
            <button className="btn btn-quiet btn-sm" onClick={() => set("assigned", "unassigned")}>Show</button>
          </div>
          <div>
            <dt>Late first reply</dt>
            <dd>{stats.data.awaiting_first_response_overdue}</dd>
          </div>
          <div>
            <dt>Assigned to me</dt>
            <dd>{stats.data.mine_active}</dd>
            <button className="btn btn-quiet btn-sm" onClick={() => set("assigned", "me")}>Show</button>
          </div>
        </dl>
      )}

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", search.trim());
        }}
      >
        <label className="field" style={{ flexBasis: 220 }}>
          <span>Search</span>
          <input className="input" placeholder="Subject, text or BL-1001" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set("q", search.trim())} />
        </label>
        <label className="field">
          <span>Status</span>
          <select className="select" value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="open,in_progress">Active (open + in progress)</option>
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          <select className="select" value={filters.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">All categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Priority</span>
          <select className="select" value={filters.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="">All priorities</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Owner</span>
          <select className="select" value={filters.assigned} onChange={(e) => set("assigned", e.target.value)}>
            <option value="any">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input className="input" type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input className="input" type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} />
        </label>
        <label className="field">
          <span>Sort</span>
          <select className="select" value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="urgency">Most urgent</option>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="activity">Recent activity</option>
          </select>
        </label>
        {!isDefault && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setFilters(DEFAULTS); setSearch(""); }}>
            Reset
          </button>
        )}
      </form>

      {list.error && <ErrorBanner message={list.error.message} onRetry={() => list.reload()} />}
      {list.loading && !list.data && <LoadingRows count={5} />}

      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title={isDefault ? "Queue is clear" : "No tickets match these filters"}
          body={isDefault ? "Every active ticket has been handled. New tickets appear here automatically." : "Widen the filters or reset them to see the full queue."}
          action={!isDefault ? <button className="btn btn-ghost" onClick={() => { setFilters(DEFAULTS); setSearch(""); }}>Reset filters</button> : undefined}
        />
      )}

      {list.data && list.data.items.length > 0 && (
        <>
          <p className="faint" style={{ marginBottom: "0.5rem" }}>
            Showing {list.data.items.length} of {list.data.total}
          </p>
          <div className="ticket-list">
            {list.data.items.map((t) => {
              const late = isOverdue(t, now);
              return (
                <Link
                  key={t.id}
                  href={`/admin/tickets/${t.id}`}
                  className={`ticket-row ${late ? "is-overdue" : ""} ${fresh.has(t.id) ? "is-fresh" : ""}`}
                  data-priority={t.priority}
                >
                  <span className="spine" aria-hidden />
                  <div className="ticket-row-body">
                    <strong>{t.subject}</strong>
                    <div className="ticket-row-meta">
                      <span className="num">{ticketRef(t.ticket_number)}</span>
                      <span>{t.author?.name}</span>
                      <span>{t.book?.title ?? "General / account"}</span>
                      <CategoryTag category={t.category} />
                      <SourceChip source={t.category_source} />
                      {t.last_reply_by === "author" && t.first_response_at && <span className="reply-dot">Author replied</span>}
                    </div>
                  </div>
                  <div className="ticket-row-side">
                    <div className="row">
                      <PriorityMark priority={t.priority} />
                      <StatusBadge status={t.status} />
                    </div>
                    <span className="age">{late ? `Late, ${ago(t.created_at, now)}` : `Opened ${ago(t.created_at, now)}`}</span>
                    <span>{t.assignee?.full_name ?? "Unassigned"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
