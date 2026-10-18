import { readOptionalJson, route } from "@/lib/api/handler";
import { draftSchema } from "@/lib/api/schemas";
import { getDraft } from "@/lib/services/drafts";

export const GET = route<{ id: string }>(async ({ user, params }) => getDraft(user, params.id), { roles: ["admin"] });

export const POST = route<{ id: string }>(
  async ({ req, user, params }) => {
    const { guidance } = draftSchema.parse(await readOptionalJson(req));
    return getDraft(user, params.id, { force: true, guidance });
  },
  { roles: ["admin"] }
);
