"use client";

import { useApi } from "@/hooks/useApi";
import { ErrorBanner, LoadingRows } from "@/components/EmptyState";
import { CATEGORY_LABELS, type TicketCategory } from "@/lib/domain/constants";
import { dateTime, number } from "@/lib/format";

interface Insights {
  provider: string;
  configured: boolean;
  models: { classify: string; draft: string };
  window_days: number;
  operations: {
    operation: string;
    calls: number;
    failures: number;
    input_tokens: number;
    output_tokens: number;
    avg_input_tokens: number;
    avg_latency_ms: number;
  }[];
  estimated_cost_usd: number;
  classification: { total: number; by_ai: number; by_rules: number; category_overrides: number; priority_overrides: number };
  replies: { total: number; ai_assisted: number };
  categories: Record<string, number>;
  recent_errors: { at: string; operation: string; error: string | null }[];
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default function InsightsPage() {
  const { data, error, loading, reload } = useApi<Insights>("/admin/ai-insights");

  if (error) return <ErrorBanner message={error.message} onRetry={() => reload()} />;
  if (loading || !data) return <LoadingRows count={4} />;

  const maxCategory = Math.max(1, ...Object.values(data.categories));
  const categoryAccuracy = data.classification.total
    ? 1 - data.classification.category_overrides / data.classification.total
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI and team insights</h1>
          <p>How the AI classifier and reply drafts are performing over the last {data.window_days} days, and where the team is correcting it.</p>
        </div>
      </div>

      {!data.configured && (
        <div className="banner banner-warn" style={{ marginBottom: "1rem" }}>
          No AI key is configured. Tickets are classified by keyword rules and drafts use policy templates.
        </div>
      )}

      <dl className="ledger">
        <div>
          <dt>Provider</dt>
          <dd style={{ fontSize: "1.1rem", textTransform: "capitalize" }}>{data.provider}</dd>
          <span className="hint">{data.models.classify} / {data.models.draft}</span>
        </div>
        <div>
          <dt>Category kept as classified</dt>
          <dd>{categoryAccuracy === null ? "—" : `${Math.round(categoryAccuracy * 100)}%`}</dd>
          <span className="hint">{data.classification.category_overrides} admin overrides</span>
        </div>
        <div>
          <dt>Priority overrides</dt>
          <dd>{data.classification.priority_overrides}</dd>
        </div>
        <div>
          <dt>Replies using AI draft</dt>
          <dd>{pct(data.replies.ai_assisted, data.replies.total)}</dd>
          <span className="hint">{data.replies.ai_assisted} of {data.replies.total}</span>
        </div>
        <div>
          <dt>Estimated spend</dt>
          <dd>${data.estimated_cost_usd.toFixed(4)}</dd>
        </div>
      </dl>

      <div className="detail-grid">
        <section className="panel">
          <h3>Model calls</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Operation</th>
                  <th className="num">Calls</th>
                  <th className="num">Failed</th>
                  <th className="num">Avg input tokens</th>
                  <th className="num">Output tokens</th>
                  <th className="num">Avg latency</th>
                </tr>
              </thead>
              <tbody>
                {data.operations.map((o) => (
                  <tr key={o.operation}>
                    <td style={{ textTransform: "capitalize" }}>{o.operation}</td>
                    <td className="num">{number(o.calls)}</td>
                    <td className="num">{number(o.failures)}</td>
                    <td className="num">{number(o.avg_input_tokens)}</td>
                    <td className="num">{number(o.output_tokens)}</td>
                    <td className="num">{o.avg_latency_ms ? `${number(o.avg_latency_ms)} ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ marginTop: "0.8rem" }}>
            {data.classification.by_ai} tickets classified by AI, {data.classification.by_rules} by keyword rules while AI was unavailable.
          </p>

          {data.recent_errors.length > 0 && (
            <>
              <h3 style={{ marginTop: "1.2rem" }}>Recent AI failures</h3>
              <ul className="timeline">
                {data.recent_errors.map((e, i) => (
                  <li key={i}>
                    <span>
                      {e.operation}: {e.error ?? "Unknown error"} <span className="faint">{dateTime(e.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="panel">
          <h3>Tickets by category</h3>
          <div className="stack" style={{ gap: "0.7rem" }}>
            {Object.entries(data.categories)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <div key={key}>
                  <div className="row row-between" style={{ fontSize: "0.86rem" }}>
                    <span>{CATEGORY_LABELS[key as TicketCategory] ?? "Not yet classified"}</span>
                    <span className="num">{count}</span>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${(count / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}
