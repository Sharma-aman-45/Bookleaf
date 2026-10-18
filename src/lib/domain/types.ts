import type {
  ClassificationSource,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole
} from "./constants";

export interface Author {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  joined_at: string | null;
  bank_linked: boolean | null;
}

export interface Book {
  id: string;
  author_id: string;
  title: string;
  isbn: string | null;
  genre: string | null;
  publication_date: string | null;
  status: string;
  package: string | null;
  mrp: number;
  total_copies_sold: number;
  total_royalty_earned: number;
  royalty_paid: number;
  royalty_pending: number;
  last_payout_date: string | null;
  platforms: string[];
}

export interface Attachment {
  path: string;
  name: string;
  size: number;
  type: string;
  url?: string | null;
}

export interface Ticket {
  id: string;
  ticket_number: number;
  author_id: string;
  book_id: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  category: TicketCategory | null;
  category_source: ClassificationSource;
  priority: TicketPriority;
  priority_source: ClassificationSource;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  assigned_to: string | null;
  attachment: Attachment | null;
  last_reply_by: UserRole | null;
  last_activity_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: UserRole;
  body: string;
  ai_assisted: boolean;
  created_at: string;
  sender?: { full_name: string } | null;
}

export interface InternalNote {
  id: string;
  ticket_id: string;
  admin_id: string | null;
  body: string;
  created_at: string;
  admin?: { full_name: string } | null;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  type: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  actor?: { full_name: string } | null;
}

export interface TicketListItem extends Ticket {
  author: Pick<Author, "id" | "name" | "email"> | null;
  book: Pick<Book, "id" | "title" | "isbn"> | null;
  assignee: { id: string; full_name: string } | null;
}

export interface TicketDetail extends TicketListItem {
  messages: TicketMessage[];
  notes?: InternalNote[];
  events?: TicketEvent[];
  book_detail?: Book | null;
}

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  authorId: string | null;
}
