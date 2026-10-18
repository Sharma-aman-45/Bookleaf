import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { keywordCategory, keywordPriority, applyPolicyGuardrails } from "../src/lib/ai/fallback";

loadEnv({ path: ".env.local", override: true });

type Json = Record<string, unknown>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });
const AUTHOR_PASSWORD = process.env.SEED_AUTHOR_PASSWORD ?? "Author@123";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";
const DATA_PATH = resolve(process.env.SEED_DATA_PATH ?? "data/bookleaf_sample_data.json");
const ticketsOnly = process.argv.includes("--tickets-only");

const ADMINS = [
  { email: "admin@bookleaf.in", name: "Riya Kapoor" },
  { email: "ops@bookleaf.in", name: "Arjun Mehta" }
];

function get(obj: Json, ...paths: string[]): unknown {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Json)[key] : undefined), obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

const str = (v: unknown) => (v === undefined ? null : String(v).trim() || null);
const num = (v: unknown) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[₹,$\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const isoDate = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const bool = (v: unknown) => (v === undefined ? null : v === true || /^(true|yes|linked|1)$/i.test(String(v)));

function platformsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((p) => (typeof p === "string" ? p : str(get(p as Json, "platform", "name", "store"))))
      .filter((p): p is string => Boolean(p));
  }
  if (raw && typeof raw === "object") return Object.keys(raw as Json);
  if (typeof raw === "string") return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function loadDataset() {
  if (!existsSync(DATA_PATH)) {
    console.error(`Dataset not found at ${DATA_PATH}. Copy bookleaf_sample_data.json into the data folder.`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8")) as Json | Json[];
  const root: Json = Array.isArray(raw) ? { authors: raw } : raw;

  const authorList = (get(root, "authors", "data.authors") as Json[] | undefined) ?? [];
  const topBooks = (get(root, "books", "data.books") as Json[] | undefined) ?? [];

  const authors = authorList.map((a, i) => {
    const id = str(get(a, "author_id", "id", "authorId")) ?? `AUTH${String(i + 1).padStart(3, "0")}`;
    const name = str(get(a, "name", "full_name", "author_name")) ?? `Author ${i + 1}`;
    const email =
      str(get(a, "email", "email_address", "contact.email"))?.toLowerCase() ??
      `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@authors.bookleaf.test`;
    return {
      id,
      name,
      email,
      phone: str(get(a, "phone", "mobile", "contact.phone")),
      city: str(get(a, "city", "location", "address.city")),
      country: str(get(a, "country", "address.country")),
      joined_at: isoDate(get(a, "joined_date", "join_date", "joined_at", "registration_date", "created_at")),
      bank_linked: bool(get(a, "bank_details_linked", "bank_linked", "bank_account_linked", "has_bank_details")),
      metadata: Object.fromEntries(Object.entries(a).filter(([k]) => k !== "books")),
      nestedBooks: (get(a, "books") as Json[] | undefined) ?? []
    };
  });

  const bookRows = [
    ...topBooks.map((b) => ({ b, parent: null as string | null })),
    ...authors.flatMap((a) => a.nestedBooks.map((b) => ({ b, parent: a.id })))
  ];

  const books = bookRows.map(({ b, parent }, i) => {
    const earned = num(get(b, "total_royalty_earned", "royalty_earned", "royalties.total_earned", "royalty.earned", "total_royalty"));
    const paid = num(get(b, "royalty_paid", "royalties.paid", "royalty.paid", "total_royalty_paid"));
    const pendingRaw = get(b, "royalty_pending", "royalties.pending", "royalty.pending", "pending_royalty");
    return {
      id: str(get(b, "book_id", "id", "bookId")) ?? `BOOK${String(i + 1).padStart(3, "0")}`,
      author_id: str(get(b, "author_id", "authorId", "author.id")) ?? parent,
      title: str(get(b, "title", "book_title", "name")) ?? `Untitled ${i + 1}`,
      isbn: str(get(b, "isbn", "isbn13", "ISBN")),
      genre: str(get(b, "genre", "category")),
      publication_date: isoDate(get(b, "publication_date", "published_date", "publish_date", "pub_date")),
      status: str(get(b, "status", "publication_status", "book_status")) ?? "Unknown",
      package: str(get(b, "package", "publishing_package", "plan")),
      mrp: num(get(b, "mrp", "MRP", "price", "mrp_inr")),
      total_copies_sold: Math.round(num(get(b, "total_copies_sold", "copies_sold", "units_sold", "sales.total_copies"))),
      total_royalty_earned: earned,
      royalty_paid: paid,
      royalty_pending: pendingRaw === undefined ? Math.max(0, earned - paid) : num(pendingRaw),
      last_payout_date: isoDate(get(b, "last_royalty_payout_date", "last_payout_date", "royalties.last_payout_date")),
      platforms: platformsOf(get(b, "distribution_platforms", "platforms", "available_on", "distribution", "sales_by_platform")),
      metadata: b
    };
  });

  const orphan = books.filter((b) => !b.author_id || !authors.some((a) => a.id === b.author_id));
  if (orphan.length) {
    console.warn(`Warning: ${orphan.length} book(s) have no matching author and will be skipped: ${orphan.map((b) => b.id).join(", ")}`);
  }

  return { authors, books: books.filter((b) => !orphan.includes(b)) };
}

async function findUserByEmail(email: string) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertAuthUser(email: string, password: string, role: "author" | "admin", name: string) {
  const existing = await findUserByEmail(email);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name: name }
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: name }
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
  return data.user.id;
}

async function must<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>, label: string): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

const SAMPLE_TICKETS = [
  {
    subject: "No royalty received for two quarters",
    description:
      "My book has been live for over 6 months and I can see sales in the dashboard, but I haven't received any royalty payment yet. My bank account is linked. Can you tell me what is going on?",
    hoursAgo: 52,
    bookIndex: 0
  },
  {
    subject: "Different ISBN on Amazon listing",
    description:
      "The ISBN on my Amazon India listing is different from the ISBN printed on the back cover of my physical copy. Readers are confused and I am worried sales are going to the wrong book.",
    hoursAgo: 30,
    bookIndex: 0
  },
  {
    subject: "Author copies arrived with blurry images",
    description:
      "I received my 20 author copies yesterday. The images inside are blurry and several pages are misaligned. I have a launch event next week and cannot use these copies.",
    hoursAgo: 6,
    bookIndex: 0
  },
  {
    subject: "Book shows Currently Unavailable on Amazon",
    description:
      "My book was published last month but it is showing as Currently Unavailable on Amazon India. Flipkart is fine. Friends are unable to order it.",
    hoursAgo: 20,
    bookIndex: 0
  },
  {
    subject: "Still in typesetting after three weeks",
    description:
      "It has been three weeks and my book is still showing typesetting as the current stage. When can I expect proofs and the final release?",
    hoursAgo: 70,
    bookIndex: -1
  },
  {
    subject: "Can I update my author bio?",
    description:
      "I would like to update my author bio and the book description on Amazon now that the book is live. What is the process and how long does it take?",
    hoursAgo: 3,
    bookIndex: null
  }
];

async function seedTickets(
  authors: { id: string; name: string }[],
  books: { id: string; author_id: string | null; status: string }[],
  adminIds: string[],
  authorProfiles: Map<string, string>
) {
  const { count, error } = await supabase.from("tickets").select("id", { count: "exact", head: true });
  if (error) throw new Error(`count tickets: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log(`Tickets already exist (${count}). Skipping demo tickets.`);
    return;
  }

  for (let i = 0; i < SAMPLE_TICKETS.length; i++) {
    const sample = SAMPLE_TICKETS[i];
    const author = authors[i % authors.length];
    const authorBooks = books.filter((b) => b.author_id === author.id);
    const inProduction = books.find((b) => !/publish|live/i.test(b.status));
    let bookId: string | null = null;
    let authorId = author.id;
    if (sample.bookIndex === -1 && inProduction) {
      bookId = inProduction.id;
      authorId = inProduction.author_id!;
    } else if (sample.bookIndex !== null && authorBooks[sample.bookIndex]) {
      bookId = authorBooks[sample.bookIndex].id;
    }

    const text = `${sample.subject}\n${sample.description}`;
    const category = keywordCategory(text);
    const priority = applyPolicyGuardrails(category, keywordPriority(text), text).priority;
    const createdAt = new Date(Date.now() - sample.hoursAgo * 36e5).toISOString();

    const ticket = (await must(
      supabase
        .from("tickets")
        .insert({
          author_id: authorId,
          book_id: bookId,
          subject: sample.subject,
          description: sample.description,
          category,
          category_source: "fallback",
          priority,
          priority_source: "fallback",
          ai_reasoning: "Seeded demo ticket, classified by keyword rules.",
          last_reply_by: "author",
          last_activity_at: createdAt,
          created_at: createdAt
        })
        .select("id")
        .single(),
      "insert demo ticket"
    )) as { id: string };

    await supabase.from("ticket_events").insert([
      { ticket_id: ticket.id, actor_id: authorProfiles.get(authorId) ?? null, type: "created", created_at: createdAt },
      { ticket_id: ticket.id, type: "rule_classified", to_value: `${category}|${priority}`, created_at: createdAt }
    ]);

    if (i === 3) {
      const repliedAt = new Date(Date.now() - (sample.hoursAgo - 2) * 36e5).toISOString();
      await supabase.from("ticket_messages").insert({
        ticket_id: ticket.id,
        sender_id: adminIds[0],
        sender_role: "admin",
        body:
          "Hi, thank you for flagging this. A Currently Unavailable status is usually a stock sync issue between our Delhi warehouse and Amazon. I have triggered a re-sync with our distribution team, and the listing should be back within 24–48 hours. I will confirm here once it is live.\n\nRiya Kapoor\nBookLeaf Author Support",
        created_at: repliedAt
      });
      await supabase
        .from("tickets")
        .update({ status: "in_progress", assigned_to: adminIds[0], first_response_at: repliedAt, last_reply_by: "admin", last_activity_at: repliedAt })
        .eq("id", ticket.id);
      await supabase.from("internal_notes").insert({
        ticket_id: ticket.id,
        admin_id: adminIds[0],
        body: "Re-sync requested with distribution. Check listing tomorrow morning.",
        created_at: repliedAt
      });
    }
  }
  console.log(`Created ${SAMPLE_TICKETS.length} demo tickets.`);
}

async function main() {
  const { authors, books } = loadDataset();
  console.log(`Dataset: ${authors.length} authors, ${books.length} books`);

  if (!ticketsOnly) {
    await must(
      supabase.from("authors").upsert(
        authors.map(({ nestedBooks, ...a }) => {
          void nestedBooks;
          return a;
        }),
        { onConflict: "id" }
      ),
      "upsert authors"
    );
    await must(supabase.from("books").upsert(books, { onConflict: "id" }), "upsert books");
  }

  const credentials: { role: string; name: string; email: string; password: string; books: number }[] = [];
  const authorProfiles = new Map<string, string>();

  for (const author of authors) {
    const userId = await upsertAuthUser(author.email, AUTHOR_PASSWORD, "author", author.name);
    await must(
      supabase
        .from("profiles")
        .upsert({ id: userId, role: "author", full_name: author.name, email: author.email, author_id: author.id }, { onConflict: "id" }),
      `profile for ${author.email}`
    );
    authorProfiles.set(author.id, userId);
    credentials.push({
      role: "author",
      name: author.name,
      email: author.email,
      password: AUTHOR_PASSWORD,
      books: books.filter((b) => b.author_id === author.id).length
    });
  }

  const adminIds: string[] = [];
  for (const admin of ADMINS) {
    const userId = await upsertAuthUser(admin.email, ADMIN_PASSWORD, "admin", admin.name);
    await must(
      supabase.from("profiles").upsert({ id: userId, role: "admin", full_name: admin.name, email: admin.email, author_id: null }, { onConflict: "id" }),
      `profile for ${admin.email}`
    );
    adminIds.push(userId);
    credentials.unshift({ role: "admin", name: admin.name, email: admin.email, password: ADMIN_PASSWORD, books: 0 });
  }

  await seedTickets(authors, books, adminIds, authorProfiles);

  mkdirSync("docs", { recursive: true });
  const table = [
    "# Test credentials",
    "",
    "| Role | Name | Email | Password | Books |",
    "| --- | --- | --- | --- | --- |",
    ...credentials.map((c) => `| ${c.role} | ${c.name} | ${c.email} | ${c.password} | ${c.role === "author" ? c.books : "-"} |`),
    ""
  ].join("\n");
  writeFileSync("docs/test-credentials.md", table);

  console.table(credentials.map(({ role, email, password, books: count }) => ({ role, email, password, books: count })));
  console.log("Credentials written to docs/test-credentials.md");
}

main().catch((error) => {
  console.error("Seed failed:", error.message ?? error);
  process.exit(1);
});
