import { route } from "@/lib/api/handler";
import { aiInsights } from "@/lib/services/insights";

export const GET = route(async () => aiInsights(), { roles: ["admin"] });
