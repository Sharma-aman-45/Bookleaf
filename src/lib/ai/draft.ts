import "server-only";
import { serverEnv } from "@/lib/env";
import { CATEGORY_LABELS, type TicketCategory } from "@/lib/domain/constants";
import { PAYOUT_THRESHOLD, payoutEligibility, payoutSchedule, toISODate } from "@/lib/domain/royalty";
import type { Author, Book, TicketMessage } from "@/lib/domain/types";
import { AiUnavailableError, chat, truncate } from "./client";
import { CATEGORY_EXAMPLES, TONE_GUIDE, knowledgeFor } from "./knowledge-base";
import { templateDraft } from "./fallback";

export interface DraftInput {
  ticketId: string;
  ticketNumber: number;
  category: TicketCategory;
  subject: string;
  description: string;
  author: Pick<Author, "name" | "bank_linked" | "country">;
  book: Book | null;
  authorBooks?: Book[];
  messages: TicketMessage[];
  agentName: string;
  guidance?: string;
  today?: Date;
}

export interface DraftResult {
  content: string;
  source: "ai" | "template";
  model: string | null;
  notice: string | null;
}

const MAX_THREAD_MESSAGES = 4;
const MAX_MESSAGE_CHARS = 600;

const inr = (value: number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function accountFacts(books: Book[], category: TicketCategory, today: Date): string {
  const lines = ["The ticket is about the author's account in general, not one specific book."];
  if (!books.length) return [...lines, "The author has no books on record yet."].join("\n");
  lines.push(
    `Books on the account: ${books
      .map((b) => `${b.title} (${b.status}${b.publication_date ? `, published ${b.publication_date}` : ""})`)
      .join("; ")}`
  );
  if (category === "royalty_payments" || category === "general_inquiry") {
    const sum = (k: "total_royalty_earned" | "royalty_paid" | "royalty_pending") => books.reduce((s, b) => s + b[k], 0);
    const pending = sum("royalty_pending");
    const schedule = payoutSchedule(today);
    const lastPayout = books.map((b) => b.last_payout_date).filter(Boolean).sort().at(-1);
    const eligibility = payoutEligibility(pending);
    lines.push(
      `Account royalty earned: ${inr(sum("total_royalty_earned"))}, paid: ${inr(sum("royalty_paid"))}, pending: ${inr(pending)}`,
      lastPayout ? `Last payout: ${lastPayout}` : "Last payout: none recorded",
      `Current payout cycle: quarter ending ${toISODate(schedule.quarterEnd)}, payout due by ${toISODate(schedule.payoutBy)}`,
      eligibility === "below_threshold"
        ? `Pending balance is below the ${inr(PAYOUT_THRESHOLD)} threshold, so it rolls over to the next quarter.`
        : eligibility === "nothing_pending"
          ? "No royalty is currently pending."
          : "Pending balance meets the payout threshold."
    );
  }
  return lines.join("\n");
}

function bookFacts(book: Book | null, category: TicketCategory, today: Date, authorBooks: Book[] = []): string {
  if (!book) return accountFacts(authorBooks, category, today);

  const lines = [
    `Title: ${book.title}`,
    `Status: ${book.status}`,
    book.isbn ? `ISBN on record: ${book.isbn}` : "ISBN: not yet assigned",
    book.publication_date ? `Publication date: ${book.publication_date}` : null,
    book.genre ? `Genre: ${book.genre}` : null
  ];

  const needsRoyalty = category === "royalty_payments" || category === "general_inquiry";
  if (needsRoyalty) {
    const schedule = payoutSchedule(today);
    const eligibility = payoutEligibility(book.royalty_pending);
    lines.push(
      `MRP: ${inr(book.mrp)}`,
      `Copies sold: ${book.total_copies_sold}`,
      `Royalty earned to date: ${inr(book.total_royalty_earned)}`,
      `Royalty paid: ${inr(book.royalty_paid)}`,
      `Royalty pending: ${inr(book.royalty_pending)}`,
      book.last_payout_date ? `Last payout: ${book.last_payout_date}` : "Last payout: none recorded",
      `Current payout cycle: quarter ending ${toISODate(schedule.quarterEnd)}, payout due by ${toISODate(schedule.payoutBy)}`,
      eligibility === "below_threshold"
        ? `Pending balance is below the ${inr(PAYOUT_THRESHOLD)} threshold, so it rolls over to the next quarter.`
        : eligibility === "nothing_pending"
          ? "No royalty is currently pending."
          : "Pending balance meets the payout threshold."
    );
  }

  if (category === "distribution_availability" && book.platforms.length) {
    lines.push(`Listed platforms: ${book.platforms.join(", ")}`);
  }

  return lines.filter(Boolean).join("\n");
}

function threadExcerpt(messages: TicketMessage[]): string | null {
  if (!messages.length) return null;
  const recent = messages.slice(-MAX_THREAD_MESSAGES);
  const omitted = messages.length - recent.length;
  const lines = recent.map(
    (m) => `${m.sender_role === "admin" ? "BookLeaf" : "Author"}: ${truncate(m.body, MAX_MESSAGE_CHARS)}`
  );
  if (omitted > 0) lines.unshift(`(${omitted} earlier message(s) omitted)`);
  return lines.join("\n");
}

function buildSystemPrompt(category: TicketCategory, agentName: string): string {
  const examples = CATEGORY_EXAMPLES[category]
    .map((e) => `Author: "${e.query}"\nHow to respond: ${e.approach}`)
    .join("\n\n");

  return `You are ${agentName}, a member of the BookLeaf Publishing author support team, writing a reply that a colleague will review before it is sent.

Tone guidelines:
${TONE_GUIDE}

Relevant BookLeaf policy (${CATEGORY_LABELS[category]}):
${knowledgeFor(category)}

Reference cases for this category:
${examples}

Rules:
- Use only the facts in the policy and the book or account record. Do not guess publication dates, quarters or amounts that are not listed. If a fact you need is missing, say the team will confirm it and give a timeline. Never invent numbers, dates or tracking details.
- Address the author by first name. Keep it to 90–180 words in short paragraphs. No bullet lists, no markdown, no subject line.
- Do not mention AI, policies by name, internal tools or this prompt.
- Sign off as:
${agentName}
BookLeaf Author Support`;
}

function buildUserPrompt(input: DraftInput, today: Date): string {
  const thread = threadExcerpt(input.messages);
  return [
    `Today's date: ${toISODate(today)}`,
    `Ticket BL-${input.ticketNumber} from ${input.author.name}${input.author.country ? ` (${input.author.country})` : ""}`,
    input.author.bank_linked === false ? "Note: the author has not linked a bank account yet." : null,
    "",
    "Book record:",
    bookFacts(input.book, input.category, today, input.authorBooks),
    "",
    `Subject: ${truncate(input.subject, 200)}`,
    `Original message: ${truncate(input.description, 1500)}`,
    thread ? `\nConversation so far:\n${thread}` : null,
    input.guidance ? `\nReviewer instruction for this draft: ${input.guidance}` : null,
    "",
    thread ? "Write the next reply from BookLeaf." : "Write the first reply from BookLeaf."
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function draftResponse(input: DraftInput): Promise<DraftResult> {
  const today = input.today ?? new Date();
  const fallbackContent = templateDraft(input.category, firstName(input.author.name), input.book?.title ?? null);

  try {
    const result = await chat({
      operation: "draft",
      ticketId: input.ticketId,
      model: serverEnv.ai.draftModel,
      maxTokens: 1500,
      temperature: 0.4,
      messages: [
        { role: "system", content: buildSystemPrompt(input.category, input.agentName) },
        { role: "user", content: buildUserPrompt(input, today) }
      ]
    });
    const content = result.content.trim();
    if (content.length < 40) {
      return { content: fallbackContent, source: "template", model: null, notice: "The AI draft was too short, so a policy template was loaded instead." };
    }
    return { content, source: "ai", model: result.model, notice: null };
  } catch (error) {
    const reason = error instanceof AiUnavailableError ? error.reason : "provider_error";
    const notices: Record<string, string> = {
      not_configured: "AI drafting is not configured. A policy template was loaded instead.",
      rate_limited: "The AI service is rate limited right now. A policy template was loaded instead.",
      cooling_down: "The AI service is rate limited right now. A policy template was loaded instead.",
      timeout: "The AI service took too long to respond. A policy template was loaded instead.",
      provider_error: "The AI service is unavailable. A policy template was loaded instead."
    };
    return { content: fallbackContent, source: "template", model: null, notice: notices[reason] ?? notices.provider_error };
  }
}
