import { route } from "@/lib/api/handler";
import { listBooks, royaltySummary } from "@/lib/services/books";

export const GET = route(async ({ req, user }) => {
  const authorId = req.nextUrl.searchParams.get("author_id") ?? undefined;
  const items = await listBooks(user, authorId);
  return { items, summary: royaltySummary(items) };
});
