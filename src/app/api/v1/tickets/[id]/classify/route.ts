import { route } from "@/lib/api/handler";
import { db } from "@/lib/supabase/admin";
import { getTicketDetail, requireTicket, runClassification } from "@/lib/services/tickets";

export const POST = route<{ id: string }>(
  async ({ user, params }) => {
    await requireTicket(user, params.id);
    await db().from("tickets").update({ category_source: "pending", priority_source: "pending" }).eq("id", params.id);
    await runClassification(params.id);
    return getTicketDetail(user, params.id);
  },
  { roles: ["admin"] }
);
