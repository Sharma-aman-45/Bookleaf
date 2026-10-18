import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type ClassificationSource,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus
} from "@/lib/domain/constants";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityMark({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`prio prio-${priority}`}>
      <i aria-hidden />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function CategoryTag({ category }: { category: TicketCategory | null }) {
  return <span className="tag">{category ? CATEGORY_LABELS[category] : "Classifying…"}</span>;
}

export function SourceChip({ source }: { source: ClassificationSource }) {
  if (source === "ai") return <span className="source-chip" title="Set by the AI classifier">AI</span>;
  if (source === "fallback") return <span className="source-chip" title="AI was unavailable, set by keyword rules">Rules</span>;
  if (source === "admin") return <span className="source-chip" title="Set by an admin">Edited</span>;
  return <span className="source-chip">Pending</span>;
}
