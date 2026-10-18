"use client";

import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/components/SessionContext";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/EmptyState";
import type { Book } from "@/lib/domain/types";
import { date, inr, number } from "@/lib/format";

interface Summary {
  books: number;
  published: number;
  copies: number;
  earned: number;
  paid: number;
  pending: number;
  threshold: number;
  eligibility: "nothing_pending" | "below_threshold" | "eligible";
  quarter_end: string;
  next_payout_by: string;
}

const isLive = (status: string) => /publish|live/i.test(status);

function payoutLine(summary: Summary) {
  if (summary.eligibility === "eligible") return `Due by ${date(summary.next_payout_by)}`;
  if (summary.eligibility === "below_threshold") return `Below the ${inr(summary.threshold)} minimum, rolls over`;
  return "Nothing pending right now";
}

function bookNote(book: Book, threshold: number) {
  if (!isLive(book.status)) return `Currently in ${book.status.toLowerCase()}. Royalties start once the book is live on stores.`;
  if (book.total_copies_sold === 0) return "No sales recorded yet. New listings usually go live 7–10 business days after publication.";
  if (book.royalty_pending > 0 && book.royalty_pending < threshold)
    return `${inr(book.royalty_pending)} pending. Balances under ${inr(threshold)} roll over to the next quarter.`;
  if (book.royalty_pending === 0) return "All earned royalties for this book have been paid out.";
  return null;
}

export default function BooksPage() {
  const user = useSession();
  const { data, error, loading, reload } = useApi<{ items: Book[]; summary: Summary }>("/books");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello, {user.fullName.split(" ")[0]}</h1>
          <p>Sales and royalties for every book you have published with BookLeaf. Royalties are calculated each quarter and paid within 45 days.</p>
        </div>
        <Link className="btn btn-primary" href="/author/tickets/new">
          Ask a question
        </Link>
      </div>

      {error && <ErrorBanner message={error.message} onRetry={() => reload()} />}
      {loading && !data && <LoadingRows count={4} />}

      {data && (
        <>
          <dl className="ledger">
            <div>
              <dt>Books</dt>
              <dd>{data.summary.books}</dd>
              <span className="hint">{data.summary.published} live on stores</span>
            </div>
            <div>
              <dt>Copies sold</dt>
              <dd>{number(data.summary.copies)}</dd>
            </div>
            <div>
              <dt>Royalty earned</dt>
              <dd>{inr(data.summary.earned)}</dd>
            </div>
            <div>
              <dt>Paid to you</dt>
              <dd>{inr(data.summary.paid)}</dd>
            </div>
            <div>
              <dt>Pending</dt>
              <dd>{inr(data.summary.pending)}</dd>
              <span className="hint">{payoutLine(data.summary)}</span>
            </div>
          </dl>

          {data.items.length === 0 ? (
            <EmptyState
              title="No books on your account yet"
              body="Once your manuscript is received, your book and its production progress will appear here."
              action={<Link className="btn btn-ghost" href="/author/tickets/new">Contact support</Link>}
            />
          ) : (
            <div className="shelf">
              {data.items.map((book) => {
                const note = bookNote(book, data.summary.threshold);
                return (
                  <article key={book.id} className="book" data-state={isLive(book.status) ? "live" : "production"}>
                    <div className="book-spine" aria-hidden />
                    <div className="book-body">
                      <div className="book-title">
                        <h3>{book.title}</h3>
                        <div className="book-meta">
                          <span>{book.genre ?? "Genre not set"}</span>
                          <span className="num">ISBN {book.isbn ?? "pending"}</span>
                          <span>{book.publication_date ? `Published ${date(book.publication_date)}` : "Not yet published"}</span>
                        </div>
                        <div className="row" style={{ marginTop: "0.6rem" }}>
                          <span className={`badge ${isLive(book.status) ? "status-resolved" : "status-in_progress"}`}>{book.status}</span>
                          <Link className="btn btn-quiet btn-sm" href={`/author/tickets/new?book=${encodeURIComponent(book.id)}`}>
                            Ask about this book
                          </Link>
                        </div>
                      </div>
                      <dl className="book-figures">
                        <div>
                          <dt>MRP</dt>
                          <dd>{inr(book.mrp)}</dd>
                        </div>
                        <div>
                          <dt>Copies sold</dt>
                          <dd>{number(book.total_copies_sold)}</dd>
                        </div>
                        <div>
                          <dt>Royalty earned</dt>
                          <dd>{inr(book.total_royalty_earned)}</dd>
                        </div>
                        <div>
                          <dt>Royalty paid</dt>
                          <dd>{inr(book.royalty_paid)}</dd>
                        </div>
                        <div>
                          <dt>Royalty pending</dt>
                          <dd>{inr(book.royalty_pending)}</dd>
                        </div>
                      </dl>
                      {note && <p className="book-note">{note}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
