import "server-only";
import { db } from "@/lib/supabase/admin";
import { ApiError, assertDb } from "@/lib/api/errors";
import { PAYOUT_THRESHOLD, payoutEligibility, payoutSchedule, toISODate } from "@/lib/domain/royalty";
import type { Book, SessionUser } from "@/lib/domain/types";

const BOOK_COLUMNS =
  "id, author_id, title, isbn, genre, publication_date, status, package, mrp, total_copies_sold, total_royalty_earned, royalty_paid, royalty_pending, last_payout_date, platforms";

function normalise(row: Record<string, unknown>): Book {
  return {
    ...(row as unknown as Book),
    mrp: Number(row.mrp ?? 0),
    total_copies_sold: Number(row.total_copies_sold ?? 0),
    total_royalty_earned: Number(row.total_royalty_earned ?? 0),
    royalty_paid: Number(row.royalty_paid ?? 0),
    royalty_pending: Number(row.royalty_pending ?? 0),
    platforms: (row.platforms as string[] | null) ?? []
  };
}

export async function listBooks(user: SessionUser, authorId?: string): Promise<Book[]> {
  let query = db().from("books").select(BOOK_COLUMNS).order("publication_date", { ascending: false, nullsFirst: true });
  if (user.role === "author") query = query.eq("author_id", user.authorId!);
  else if (authorId) query = query.eq("author_id", authorId);
  const rows = assertDb(await query, "load books");
  return (rows as Record<string, unknown>[]).map(normalise);
}

export async function getBook(user: SessionUser, id: string): Promise<Book> {
  const row = assertDb(await db().from("books").select(BOOK_COLUMNS).eq("id", id).maybeSingle(), "load book");
  if (!row || (user.role === "author" && (row as { author_id: string }).author_id !== user.authorId)) {
    throw ApiError.notFound("Book");
  }
  return normalise(row as Record<string, unknown>);
}

export async function getBookById(id: string): Promise<Book | null> {
  const row = assertDb(await db().from("books").select(BOOK_COLUMNS).eq("id", id).maybeSingle(), "load book");
  return row ? normalise(row as Record<string, unknown>) : null;
}

export function royaltySummary(books: Book[], today = new Date()) {
  const totals = books.reduce(
    (acc, b) => ({
      copies: acc.copies + b.total_copies_sold,
      earned: acc.earned + b.total_royalty_earned,
      paid: acc.paid + b.royalty_paid,
      pending: acc.pending + b.royalty_pending
    }),
    { copies: 0, earned: 0, paid: 0, pending: 0 }
  );
  const schedule = payoutSchedule(today);
  return {
    ...totals,
    books: books.length,
    published: books.filter((b) => /publish|live/i.test(b.status)).length,
    threshold: PAYOUT_THRESHOLD,
    eligibility: payoutEligibility(totals.pending),
    quarter_end: toISODate(schedule.quarterEnd),
    next_payout_by: toISODate(schedule.payoutBy)
  };
}
