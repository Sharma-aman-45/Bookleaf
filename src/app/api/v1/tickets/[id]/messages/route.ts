import { readJson, route } from "@/lib/api/handler";
import { messageSchema } from "@/lib/api/schemas";
import { addMessage, getTicketDetail } from "@/lib/services/tickets";

export const GET = route<{ id: string }>(async ({ user, params }) => (await getTicketDetail(user, params.id)).messages);

export const POST = route<{ id: string }>(
  async ({ req, user, params }) => {
    const input = messageSchema.parse(await readJson(req));
    if (user.role === "author") input.status = undefined;
    return addMessage(user, params.id, input);
  },
  { status: 201 }
);
