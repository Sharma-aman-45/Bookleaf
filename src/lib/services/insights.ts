import "server-only";
import { db } from "@/lib/supabase/admin";
import { assertDb } from "@/lib/api/errors";
import { serverEnv } from "@/lib/env";
import { aiConfigured } from "@/lib/ai/client";
import { RESPONSE_TARGET_HOURS, type TicketPriority } from "@/lib/domain/constants";

interface TicketRow {
  status: string;
  priority: TicketPriority;
  category: string | null;
  category_source: string;
  priority_source: string;
  assigned_to: string | null;
  first_response_at: string | null;
  created_at: string;
}

export async function queueStats(adminId: string) {
  const rows = assertDb(
    await db()
      .from("tickets")
      .select("status, priority, category, category_source, priority_source, assigned_to, first_response_at, created_at"),
    "load ticket stats"
  ) as TicketRow[];

  const now = Date.now();
  const active = rows.filter((r) => r.status === "open" || r.status === "in_progress");
  const breaching = active.filter((r) => {
    if (r.first_response_at) return false;
    const hours = (now - new Date(r.created_at).getTime()) / 36e5;
    return hours > RESPONSE_TARGET_HOURS[r.priority];
  });

  return {
    total: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    in_progress: rows.filter((r) => r.status === "in_progress").length,
    resolved: rows.filter((r) => r.status === "resolved" || r.status === "closed").length,
    critical_active: active.filter((r) => r.priority === "critical").length,
    unassigned_active: active.filter((r) => !r.assigned_to).length,
    mine_active: active.filter((r) => r.assigned_to === adminId).length,
    awaiting_first_response_overdue: breaching.length
  };
}

export async function aiInsights() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [usageRes, ticketRes, messageRes] = await Promise.all([
    db().from("ai_usage").select("operation, model, success, input_tokens, output_tokens, latency_ms, error, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    db().from("tickets").select("category, category_source, priority_source"),
    db().from("ticket_messages").select("ai_assisted, sender_role").eq("sender_role", "admin")
  ]);

  const usage = assertDb(usageRes, "load AI usage") as {
    operation: string;
    model: string | null;
    success: boolean;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number | null;
    error: string | null;
    created_at: string;
  }[];
  const tickets = assertDb(ticketRes, "load tickets") as { category: string | null; category_source: string; priority_source: string }[];
  const replies = assertDb(messageRes, "load replies") as { ai_assisted: boolean }[];

  const byOperation = ["classify", "draft"].map((operation) => {
    const rows = usage.filter((u) => u.operation === operation);
    const ok = rows.filter((u) => u.success);
    const input = ok.reduce((s, u) => s + u.input_tokens, 0);
    const output = ok.reduce((s, u) => s + u.output_tokens, 0);
    return {
      operation,
      calls: rows.length,
      failures: rows.length - ok.length,
      input_tokens: input,
      output_tokens: output,
      avg_input_tokens: ok.length ? Math.round(input / ok.length) : 0,
      avg_latency_ms: ok.length ? Math.round(ok.reduce((s, u) => s + (u.latency_ms ?? 0), 0) / ok.length) : 0
    };
  });

  const totalInput = byOperation.reduce((s, o) => s + o.input_tokens, 0);
  const totalOutput = byOperation.reduce((s, o) => s + o.output_tokens, 0);
  const estimatedCost =
    (totalInput / 1e6) * serverEnv.ai.inputCostPerMTok + (totalOutput / 1e6) * serverEnv.ai.outputCostPerMTok;

  const classified = tickets.filter((t) => t.category_source !== "pending");
  const categoryOverrides = tickets.filter((t) => t.category_source === "admin").length;
  const priorityOverrides = tickets.filter((t) => t.priority_source === "admin").length;

  const categories = tickets.reduce<Record<string, number>>((acc, t) => {
    const key = t.category ?? "unclassified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    provider: serverEnv.ai.provider,
    configured: aiConfigured(),
    models: { classify: serverEnv.ai.classifyModel, draft: serverEnv.ai.draftModel },
    window_days: 30,
    operations: byOperation,
    estimated_cost_usd: Number(estimatedCost.toFixed(4)),
    classification: {
      total: classified.length,
      by_ai: tickets.filter((t) => t.category_source === "ai").length,
      by_rules: tickets.filter((t) => t.category_source === "fallback").length,
      category_overrides: categoryOverrides,
      priority_overrides: priorityOverrides
    },
    replies: { total: replies.length, ai_assisted: replies.filter((r) => r.ai_assisted).length },
    categories,
    recent_errors: usage.filter((u) => !u.success).slice(0, 5).map((u) => ({ at: u.created_at, operation: u.operation, error: u.error }))
  };
}

export async function listAdmins() {
  return assertDb(
    await db().from("profiles").select("id, full_name, email").eq("role", "admin").order("full_name"),
    "load admins"
  );
}
