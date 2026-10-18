import {
  PRIORITY_RANK,
  type TicketCategory,
  type TicketPriority
} from "@/lib/domain/constants";

const CATEGORY_PATTERNS: [TicketCategory, RegExp[]][] = [
  ["general_inquiry", [/\b(author )?bio\b/i, /(update|change|edit).{0,30}description/i, /\bpackage\b/i, /how (do|can) i/i]],
  ["isbn_metadata", [/\bisbn\b/i, /\bmetadata\b/i, /\bimprint\b/i, /wrong (book|title|author name)/i, /barcode/i]],
  [
    "royalty_payments",
    [/royalt/i, /payout/i, /payment/i, /\bpaid\b/i, /\bbank\b/i, /earning/i, /₹|rs\.?\s?\d|inr/i, /statement/i]
  ],
  [
    "printing_quality",
    [/print(ing|ed)? quality/i, /misprint/i, /binding/i, /blurry|blurred/i, /misalign/i, /torn|damaged|defect/i, /author cop(y|ies)/i, /colou?r/i]
  ],
  [
    "distribution_availability",
    [/unavailable/i, /out of stock/i, /amazon|flipkart/i, /listing/i, /not (showing|visible|listed)/i, /buy (link|button)/i]
  ],
  [
    "book_status_production",
    [/typesetting/i, /cover design/i, /proof(read|s)/i, /production/i, /\bstatus\b/i, /when will (my|the) book/i, /manuscript/i, /still in/i]
  ]
];

export function keywordCategory(text: string): TicketCategory {
  let best: { category: TicketCategory; score: number } = { category: "general_inquiry", score: 0 };
  for (const [category, patterns] of CATEGORY_PATTERNS) {
    const score = patterns.reduce((sum, p) => sum + (p.test(text) ? 1 : 0), 0);
    if (score > best.score) best = { category, score };
  }
  return best.category;
}

const CRITICAL_PATTERNS = [
  /(haven'?t|not|never) (been )?(received|got|paid).{0,40}(\d+|six|five|four|several) (months|quarters)/i,
  /legal|lawyer|consumer court|fraud|scam/i,
  /someone else.{0,20}(selling|published)|plagiari|piracy|pirated/i
];

const HIGH_PATTERNS = [
  /\bisbn\b.{0,40}(wrong|different|duplicate|mismatch|incorrect)/i,
  /(wrong|different|duplicate|mismatch|incorrect).{0,40}\bisbn\b/i,
  /(haven'?t|not|never) (been )?(received|got|paid)/i,
  /overdue|delayed payment|missing payment/i,
  /unavailable|out of stock/i,
  /(blurry|misprint|misalign|defect|damaged)/i,
  /urgent|asap|immediately|launch (event|date)/i
];

const LOW_PATTERNS = [/\bbio\b/i, /description/i, /how (do|can) i/i, /can i (update|change)/i, /\bquestion\b/i, /curious/i];

export function keywordPriority(text: string): TicketPriority {
  if (CRITICAL_PATTERNS.some((p) => p.test(text))) return "critical";
  if (HIGH_PATTERNS.some((p) => p.test(text))) return "high";
  if (LOW_PATTERNS.some((p) => p.test(text))) return "low";
  return "medium";
}

function atLeast(priority: TicketPriority, floor: TicketPriority): TicketPriority {
  return PRIORITY_RANK[priority] <= PRIORITY_RANK[floor] ? priority : floor;
}

export function applyPolicyGuardrails(
  category: TicketCategory,
  priority: TicketPriority,
  text: string
): { priority: TicketPriority; adjusted: boolean } {
  let next = priority;
  if (category === "isbn_metadata" && /\bisbn\b/i.test(text) && /(wrong|different|duplicate|mismatch|incorrect|linked)/i.test(text)) {
    next = atLeast(next, "high");
  }
  if (CRITICAL_PATTERNS.some((p) => p.test(text))) next = atLeast(next, "critical");
  return { priority: next, adjusted: next !== priority };
}

export function templateDraft(category: TicketCategory, authorFirstName: string, bookTitle: string | null): string {
  const book = bookTitle ? `"${bookTitle}"` : "your book";
  const greeting = `Hi ${authorFirstName},`;
  const close = "Warm regards,\nBookLeaf Author Support";
  const bodies: Record<TicketCategory, string> = {
    royalty_payments: `Thank you for reaching out about the royalties for ${book}, and I understand how important it is to have clarity here.\n\nRoyalties are calculated quarterly and paid within 45 days of each quarter ending. Your share is 80% of the net profit per copy (MRP minus printing, platform commission and shipping). If the balance is below ₹1,000, it rolls over to the next quarter.\n\nI am reviewing your royalty records and linked bank details now, and will share a line-by-line breakdown within 48 hours.`,
    isbn_metadata: `Thank you for flagging this. An ISBN or metadata mismatch on ${book} is a serious issue and we are treating it as high priority.\n\nI have escalated this to our production team, and we will have it corrected and confirmed with you within 48 hours.`,
    printing_quality: `I am sorry the copies of ${book} did not meet the standard you should expect from us.\n\nCould you reply with a few clear photos of the defective pages or binding? Once we verify them, we will arrange a free reprint, which takes 5–7 business days.`,
    distribution_availability: `Thank you for letting us know about the listing for ${book}.\n\nThis is usually a stock sync issue between our warehouse and the platform. I am triggering a re-sync with our distribution team now, and the listing should be live again within 24–48 hours. I will confirm once it is back.`,
    book_status_production: `Thank you for checking in on ${book}, and I understand the wait has been longer than you hoped.\n\nI am confirming the current production stage with our team and will send you a specific updated timeline within 24 hours.`,
    general_inquiry: `Thank you for reaching out.\n\nI am looking into your question and will get back to you with a complete answer within 24 hours.`
  };
  return `${greeting}\n\n${bodies[category]}\n\n${close}`;
}
