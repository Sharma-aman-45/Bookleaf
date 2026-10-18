import { z } from "zod";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES
} from "@/lib/domain/constants";

const text = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.")
});

export const attachmentSchema = z.object({
  path: z.string().min(3).max(300),
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  type: z.enum(ATTACHMENT_TYPES as [string, ...string[]])
});

export const createTicketSchema = z.object({
  book_id: z.string().trim().min(1).nullable().optional(),
  subject: text(5, 150, "Subject"),
  description: text(20, 5000, "Description"),
  attachment: attachmentSchema.nullable().optional()
});

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(values)));

export const ticketQuerySchema = z.object({
  status: csvEnum(TICKET_STATUSES),
  category: csvEnum(TICKET_CATEGORIES),
  priority: csvEnum(TICKET_PRIORITIES),
  assigned: z.enum(["me", "unassigned", "any"]).default("any"),
  from: z.string().date("from must be YYYY-MM-DD").optional(),
  to: z.string().date("to must be YYYY-MM-DD").optional(),
  q: z.string().trim().max(100).optional(),
  author_id: z.string().trim().max(50).optional(),
  sort: z.enum(["urgency", "oldest", "newest", "activity"]).default("urgency"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const updateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigned_to: z.union([z.literal("me"), z.string().uuid(), z.null()]).optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update." });

export const messageSchema = z.object({
  body: text(2, 5000, "Message"),
  ai_assisted: z.boolean().optional().default(false),
  status: z.enum(TICKET_STATUSES).optional()
});

export const noteSchema = z.object({
  body: text(2, 3000, "Note")
});

export const draftSchema = z.object({
  guidance: z.string().trim().max(300).optional()
});

export type TicketQuery = z.infer<typeof ticketQuerySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
