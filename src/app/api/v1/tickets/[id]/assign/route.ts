import { route } from "@/lib/api/handler";
import { updateTicket } from "@/lib/services/tickets";

export const POST = route<{ id: string }>(
  async ({ user, params }) => updateTicket(user, params.id, { assigned_to: "me" }),
  { roles: ["admin"] }
);

export const DELETE = route<{ id: string }>(
  async ({ user, params }) => updateTicket(user, params.id, { assigned_to: null }),
  { roles: ["admin"] }
);
