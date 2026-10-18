"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { api, post, ApiClientError } from "@/lib/client/api";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from "@/lib/domain/constants";
import type { Attachment, Book, Ticket } from "@/lib/domain/types";

const HINTS: { match: RegExp; text: string }[] = [
  { match: /print|blur|binding|misprint|damaged|defect|copies/i, text: "For print quality issues, attach a photo of the affected pages so we can approve a free reprint faster." },
  { match: /royalt|payout|payment|paid/i, text: "Mention the quarter or month you expected the payout, and whether your bank account is linked in your dashboard." },
  { match: /isbn/i, text: "Include the ISBN shown on the store listing and the one printed on your copy." },
  { match: /amazon|flipkart|unavailable|listing/i, text: "Include the store and country (for example Amazon India or Amazon US) where the book looks unavailable." }
];

function NewTicketForm() {
  const router = useRouter();
  const params = useSearchParams();
  const books = useApi<{ items: Book[] }>("/books");
  const fileInput = useRef<HTMLInputElement>(null);

  const [bookId, setBookId] = useState<string>(params.get("book") ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const requested = params.get("book");
    if (requested) setBookId(requested);
  }, [params]);

  const hint = HINTS.find((h) => h.match.test(`${subject} ${description}`));

  function pickFile(next: File | null) {
    setFileError(null);
    if (!next) return setFile(null);
    if (!ATTACHMENT_TYPES.includes(next.type)) return setFileError("Choose a PNG, JPG, WEBP or PDF file.");
    if (next.size > ATTACHMENT_MAX_BYTES) return setFileError("Files must be 5 MB or smaller.");
    setFile(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local: Record<string, string> = {};
    if (subject.trim().length < 5) local.subject = "Add a subject of at least 5 characters.";
    if (description.trim().length < 20) local.description = "Describe the issue in at least 20 characters so we can help on the first reply.";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    setFormError(null);
    try {
      let attachment: Attachment | null = null;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        try {
          attachment = await api<Attachment>("/uploads", { method: "POST", body: form });
        } catch (e) {
          setFileError(e instanceof ApiClientError ? e.message : "Upload failed.");
          setBusy(false);
          return;
        }
      }
      const ticket = await post<Ticket>("/tickets", {
        book_id: bookId || null,
        subject,
        description,
        attachment
      });
      router.push(`/author/tickets/${ticket.id}?created=1`);
    } catch (e) {
      if (e instanceof ApiClientError && e.details) {
        setErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
      }
      setFormError(e instanceof ApiClientError ? e.message : "Could not submit your ticket. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ask a question</h1>
          <p>Tell us what is happening and which book it is about. Most tickets get a first reply within one business day.</p>
        </div>
      </div>

      <form className="form-grid panel" onSubmit={submit} noValidate>
        {formError && <div className="banner banner-error" role="alert">{formError}</div>}

        <label className="field">
          <span>Which book is this about?</span>
          <select className="select" value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={books.loading}>
            <option value="">General / account level</option>
            {books.data?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.status})
              </option>
            ))}
          </select>
          {errors.book_id && <span className="field-error">{errors.book_id}</span>}
        </label>

        <label className="field">
          <span>Subject</span>
          <input
            className="input"
            value={subject}
            maxLength={150}
            placeholder="For example: Q2 royalty not received"
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={Boolean(errors.subject)}
          />
          {errors.subject && <span className="field-error">{errors.subject}</span>}
        </label>

        <label className="field">
          <span>Details</span>
          <textarea
            className="textarea"
            value={description}
            maxLength={5000}
            placeholder="What happened, when you noticed it, and anything you have already tried."
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={Boolean(errors.description)}
          />
          <span className="row row-between">
            {errors.description ? <span className="field-error">{errors.description}</span> : <span />}
            <span className="faint num">{description.length} / 5000</span>
          </span>
        </label>

        {hint && <div className="banner">{hint.text}</div>}

        <div className="field">
          <span>Attachment (optional)</span>
          <div className="dropzone">
            <span className="helper">{file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "Photos of a defective copy, a screenshot of a listing, or a statement. PNG, JPG, WEBP or PDF up to 5 MB."}</span>
            <div className="row">
              {file && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>
                  Remove
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>
                {file ? "Replace file" : "Choose file"}
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={ATTACHMENT_TYPES.join(",")}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {fileError && <span className="field-error">{fileError}</span>}
        </div>

        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit ticket"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => router.back()} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}

export default function NewTicketPage() {
  return (
    <Suspense>
      <NewTicketForm />
    </Suspense>
  );
}
