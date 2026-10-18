import { after } from "next/server";
import { readJson, route } from "@/lib/api/handler";
import { createTicketSchema, ticketQuerySchema } from "@/lib/api/schemas";
import { createTicket, listTickets, runClassification } from "@/lib/services/tickets";

export const GET = route(async ({ req, user }) => {
  const query = ticketQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return listTickets(user, query);
});

export const POST = route(
  async ({ req, user }) => {
    const input = createTicketSchema.parse(await readJson(req));
    const ticket = await createTicket(user, input);
    after(() => runClassification(ticket.id));
    return ticket;
  },
  { roles: ["author"], status: 201 }
);
