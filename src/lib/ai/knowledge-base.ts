import type { TicketCategory } from "@/lib/domain/constants";

export type KbSectionKey =
  | "overview"
  | "royalty"
  | "isbn"
  | "printing"
  | "distribution"
  | "production"
  | "metadata";

export const KB_SECTIONS: Record<KbSectionKey, string> = {
  overview: [
    "BookLeaf Publishing is a self-publishing company operating in India and the US.",
    "Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid, with marketing and distribution add-ons).",
    "BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution and royalty management.",
    "In-house printing facility and warehouse in Delhi; print partners include Repro India and Epitome Books."
  ].join("\n"),
  royalty: [
    "Royalty split is 80/20: 80% of net profit per book goes to the author, 20% to BookLeaf.",
    "Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.",
    "Royalties are calculated quarterly and paid within 45 days of the quarter ending.",
    "Minimum payout threshold is ₹1,000. Balances below this roll over to the next quarter.",
    "Payouts go by bank transfer to the account linked in the author's dashboard.",
    "Authors can view a detailed royalty breakdown with per-platform sales in their dashboard."
  ].join("\n"),
  isbn: [
    "Every BookLeaf book receives a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.",
    "Authors wanting an ISBN under their own imprint must obtain it independently.",
    "ISBN errors (duplicate ISBN, wrong book linked) are high priority and escalated to the production team, with a 48-hour resolution timeline."
  ].join("\n"),
  printing: [
    "In-house printing handles most orders; overflow or special formats go to Repro India or Epitome Books.",
    "Standard print turnaround is 5–7 business days from order confirmation.",
    "For quality issues (misprints, binding defects, colour inconsistency) BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy. Reprints take 5–7 business days."
  ].join("\n"),
  distribution: [
    "Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.",
    "New listings typically go live 7–10 business days after publication is complete.",
    "A book showing as unavailable is usually a stock sync issue; BookLeaf can trigger a re-sync that takes 24–48 hours."
  ].join("\n"),
  production: [
    "Production stages in order: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.",
    "Authors receive an email update at each stage.",
    "Delays usually happen at Cover Design (waiting for author approval) and Proofreading (revision rounds). Never blame the author; frame delays collaboratively and give a specific updated timeline."
  ].join("\n"),
  metadata: [
    "Metadata (book description, author bio, keywords) can be updated after a book is live, via the dashboard or by emailing the BookLeaf team.",
    "Metadata changes typically reflect on platforms within 3–5 business days."
  ].join("\n")
};

export const TONE_GUIDE = [
  "Empathetic and professional. Authors are partners, not customers to be managed.",
  "Acknowledge the author's concern before moving to solutions.",
  "Be specific: use the actual numbers, dates and statuses provided. Never invent figures.",
  "If BookLeaf is at fault (delayed royalties, ISBN error), own it directly. No corporate deflection.",
  "If escalation is needed, give a clear timeline such as 'within 48 hours', not open-ended promises.",
  "Always end with a clear next step for the author and/or the BookLeaf team."
].join("\n");

export const CATEGORY_SECTIONS: Record<TicketCategory, KbSectionKey[]> = {
  royalty_payments: ["royalty"],
  isbn_metadata: ["isbn", "metadata"],
  printing_quality: ["printing"],
  distribution_availability: ["distribution"],
  book_status_production: ["production", "distribution"],
  general_inquiry: ["overview", "metadata"]
};

export const CATEGORY_EXAMPLES: Record<TicketCategory, { query: string; approach: string }[]> = {
  royalty_payments: [
    {
      query: "I published my book 4 months ago and still haven't received any royalty. What's going on?",
      approach:
        "Acknowledge the frustration. Explain the quarterly cycle and 45-day payout window. Check bank details are linked. Give the specific next payout date. If genuinely overdue, escalate with a 48-hour resolution timeline."
    },
    {
      query: "My royalty amount seems too low. I sold 200 copies but only received ₹3,000.",
      approach:
        "Explain net profit: MRP minus printing, platform commission and shipping. Offer a line-by-line royalty breakdown. Be transparent, not defensive."
    }
  ],
  isbn_metadata: [
    {
      query: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
      approach:
        "Treat as high priority and acknowledge it is a serious data issue. Confirm immediate escalation to production. Give a 48-hour resolution timeline."
    }
  ],
  printing_quality: [
    {
      query: "My author copies arrived and the images are blurry and pages are misaligned.",
      approach:
        "Apologise sincerely. Ask for photos of the defective copies. Confirm a free reprint once verified, with a 5–7 business day timeline."
    }
  ],
  distribution_availability: [
    {
      query: "My book is published but shows 'Currently Unavailable' on Amazon.",
      approach:
        "Explain it is typically a stock sync issue. Confirm a re-sync is being triggered with the distribution team. Expect 24–48 hours."
    }
  ],
  book_status_production: [
    {
      query: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
      approach:
        "State the actual production status. If delayed, be honest about why (for example, waiting on proof approval) without blaming the author. Give a specific updated timeline."
    }
  ],
  general_inquiry: [
    {
      query: "Can I update my book description on Amazon after it's live?",
      approach:
        "Yes: submit through the dashboard or email the team. Changes reflect within 3–5 business days."
    }
  ]
};

export function knowledgeFor(category: TicketCategory): string {
  return CATEGORY_SECTIONS[category].map((key) => KB_SECTIONS[key]).join("\n");
}
