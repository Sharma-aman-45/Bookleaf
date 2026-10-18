import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  CATEGORY_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority
} from "@/lib/domain/constants";
import { AiUnavailableError, chat, extractJson, truncate } from "./client";
import { applyPolicyGuardrails, keywordCategory, keywordPriority } from "./fallback";

export interface Classification {
  category: TicketCategory;
  priority: TicketPriority;
  confidence: number | null;
  reasoning: string;
  source: "ai" | "fallback";
}

const resultSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().max(400).optional()
});

const CATEGORY_GUIDE = TICKET_CATEGORIES.map((key) => `- ${key}: ${CATEGORY_LABELS[key]}`).join("\n");

const SYSTEM_PROMPT = `You triage author support tickets for BookLeaf Publishing, a self-publishing company in India and the US.

Choose exactly one category:
${CATEGORY_GUIDE}

Category hints:
- royalty_payments: royalty amounts, payout timing, bank details, sales figures used for royalties.
- isbn_metadata: ISBN mismatch or duplication, wrong book linked to an ISBN, incorrect title or author name on listings.
- printing_quality: physical copy defects, author copies, print turnaround.
- distribution_availability: book unavailable, not listed, missing on Amazon/Flipkart/BookLeaf Store.
- book_status_production: where a book is in production (editing, cover, typesetting, proofreading) and timelines.
- general_inquiry: anything else, including account and policy questions and requests to update an author bio or book description.

Priority rubric:
- critical: money withheld for a long time (two quarters or more), legal threats, piracy, a live book selling with wrong ISBN/author, or anything causing ongoing financial or reputational harm.
- high: ISBN errors, missing or overdue payouts, books unavailable for sale, defective copies, deadline-bound requests.
- medium: delays or confusion that need investigation but cause no immediate loss.
- low: informational questions and cosmetic updates such as bio or description changes.

Reply with a single JSON object and nothing else, no code fences: {"category": "<key>", "priority": "<critical|high|medium|low>", "confidence": <0-1>, "reason": "<one short sentence>"}`;

function fallback(text: string, reason: string): Classification {
  const category = keywordCategory(text);
  const guarded = applyPolicyGuardrails(category, keywordPriority(text), text);
  return { category, priority: guarded.priority, confidence: null, reasoning: reason, source: "fallback" };
}

export async function classifyTicket(input: {
  ticketId?: string;
  subject: string;
  description: string;
  bookStatus?: string | null;
}): Promise<Classification> {
  const text = `${input.subject}\n${input.description}`;
  const userContent = [
    `Subject: ${truncate(input.subject, 200)}`,
    input.bookStatus ? `Book status: ${input.bookStatus}` : null,
    `Message: ${truncate(input.description, 1500)}`
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await chat({
      operation: "classify",
      ticketId: input.ticketId,
      model: serverEnv.ai.classifyModel,
      maxTokens: 600,
      temperature: 0,
      json: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]
    });

    const parsed = resultSchema.safeParse(extractJson(result.content));
    if (!parsed.success) return fallback(text, "AI returned an unexpected format; classified by keyword rules.");

    const guarded = applyPolicyGuardrails(parsed.data.category, parsed.data.priority, text);
    const reason = parsed.data.reason ?? "";
    return {
      category: parsed.data.category,
      priority: guarded.priority,
      confidence: parsed.data.confidence ?? null,
      reasoning: guarded.adjusted ? `${reason} Priority raised by BookLeaf policy rules.`.trim() : reason,
      source: "ai"
    };
  } catch (error) {
    const message =
      error instanceof AiUnavailableError
        ? `AI unavailable (${error.reason}); classified by keyword rules.`
        : "AI response could not be read; classified by keyword rules.";
    return fallback(text, message);
  }
}
