import { route } from "@/lib/api/handler";
import { queueStats } from "@/lib/services/insights";

export const GET = route(async ({ user }) => queueStats(user.id), { roles: ["admin"] });
