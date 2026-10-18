import { readJson, route } from "@/lib/api/handler";
import { noteSchema } from "@/lib/api/schemas";
import { addNote, listNotes } from "@/lib/services/tickets";

export const GET = route<{ id: string }>(async ({ user, params }) => listNotes(user, params.id), { roles: ["admin"] });

export const POST = route<{ id: string }>(
  async ({ req, user, params }) => addNote(user, params.id, noteSchema.parse(await readJson(req)).body),
  { roles: ["admin"], status: 201 }
);
