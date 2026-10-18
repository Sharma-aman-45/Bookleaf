import { route } from "@/lib/api/handler";
import { getBook } from "@/lib/services/books";

export const GET = route<{ id: string }>(async ({ user, params }) => getBook(user, params.id));
