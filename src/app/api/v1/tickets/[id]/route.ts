import { readJson, route } from "@/lib/api/handler";
import { updateTicketSchema } from "@/lib/api/schemas";
import { getTicketDetail, updateTicket } from "@/lib/services/tickets";

export const GET = route<{ id: string }>(async ({ user, params }) => getTicketDetail(user, params.id));

export const PATCH = route<{ id: string }>(
  async ({ req, user, params }) => updateTicket(user, params.id, updateTicketSchema.parse(await readJson(req))),
  { roles: ["admin"] }
);
