import "server-only";
import { serverEnv } from "@/lib/env";
import { db } from "@/lib/supabase/admin";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  operation: "classify" | "draft";
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  json?: boolean;
  ticketId?: string;
}

export interface ChatResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiUnavailableError extends Error {
  constructor(public reason: "not_configured" | "rate_limited" | "timeout" | "provider_error" | "cooling_down", message: string) {
    super(message);
  }
}

let cooldownUntil = 0;

function isReasoningModel(model: string) {
  return /gpt-oss|qwen3|deepseek-r1|o\d/i.test(model);
}

export function aiConfigured(): boolean {
  return Boolean(serverEnv.ai.apiKey);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logUsage(entry: {
  operation: string;
  model: string;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  error?: string;
  ticketId?: string;
}) {
  const { error } = await db().from("ai_usage").insert({
    ticket_id: entry.ticketId ?? null,
    operation: entry.operation,
    model: entry.model,
    success: entry.success,
    input_tokens: entry.inputTokens ?? 0,
    output_tokens: entry.outputTokens ?? 0,
    latency_ms: entry.latencyMs,
    error: entry.error?.slice(0, 500) ?? null
  });
  if (error) console.warn("[ai] usage log failed", error.message);
}

async function callOnce(request: ChatRequest): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), serverEnv.ai.timeoutMs);
  try {
    return await fetch(`${serverEnv.ai.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.ai.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        ...(request.json && !isReasoningModel(request.model) ? { response_format: { type: "json_object" } } : {}),
        ...(isReasoningModel(request.model) ? { reasoning_effort: serverEnv.ai.reasoningEffort, include_reasoning: false } : {})
      })
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(request: ChatRequest): Promise<ChatResult> {
  if (!aiConfigured()) throw new AiUnavailableError("not_configured", "AI provider key is not configured.");
  if (Date.now() < cooldownUntil) {
    throw new AiUnavailableError("cooling_down", "AI provider is rate limited; skipping call until cooldown ends.");
  }

  const started = Date.now();
  let lastError: AiUnavailableError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await callOnce(request);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "5");
        const waitMs = Math.min(Math.max(retryAfter, 1), 60) * 1000;
        lastError = new AiUnavailableError("rate_limited", "AI provider rate limit reached.");
        if (attempt === 0 && waitMs <= 3000) {
          await sleep(waitMs);
          continue;
        }
        cooldownUntil = Date.now() + waitMs;
        break;
      }

      if (res.status >= 500) {
        lastError = new AiUnavailableError("provider_error", `AI provider returned ${res.status}.`);
        if (attempt === 0) {
          await sleep(800);
          continue;
        }
        break;
      }

      if (!res.ok) {
        const body = await res.text();
        lastError = new AiUnavailableError("provider_error", `AI provider rejected the request (${res.status}): ${body.slice(0, 200)}`);
        break;
      }

      const json = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      const result: ChatResult = {
        content,
        model: json?.model ?? request.model,
        inputTokens: json?.usage?.prompt_tokens ?? 0,
        outputTokens: json?.usage?.completion_tokens ?? 0
      };
      await logUsage({
        operation: request.operation,
        model: result.model,
        success: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: Date.now() - started,
        ticketId: request.ticketId
      });
      return result;
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = new AiUnavailableError(
        aborted ? "timeout" : "provider_error",
        aborted ? "AI provider timed out." : `AI request failed: ${(error as Error).message}`
      );
      if (attempt === 0 && !aborted) {
        await sleep(500);
        continue;
      }
      break;
    }
  }

  await logUsage({
    operation: request.operation,
    model: request.model,
    success: false,
    latencyMs: Date.now() - started,
    error: lastError?.message,
    ticketId: request.ticketId
  });
  throw lastError ?? new AiUnavailableError("provider_error", "AI request failed.");
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
