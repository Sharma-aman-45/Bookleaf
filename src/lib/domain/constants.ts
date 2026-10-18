export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export const TICKET_CATEGORIES = [
  "royalty_payments",
  "isbn_metadata",
  "printing_quality",
  "distribution_availability",
  "book_status_production",
  "general_inquiry"
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type UserRole = "author" | "admin";
export type ClassificationSource = "pending" | "ai" | "fallback" | "admin";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed"
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low"
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  royalty_payments: "Royalty & Payments",
  isbn_metadata: "ISBN & Metadata Issues",
  printing_quality: "Printing & Quality",
  distribution_availability: "Distribution & Availability",
  book_status_production: "Book Status & Production Updates",
  general_inquiry: "General Inquiry"
};

export const PRIORITY_RANK: Record<TicketPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export const RESPONSE_TARGET_HOURS: Record<TicketPriority, number> = {
  critical: 4,
  high: 24,
  medium: 48,
  low: 72
};

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const ATTACHMENT_BUCKET = "ticket-attachments";
