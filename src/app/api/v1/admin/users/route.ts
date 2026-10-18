import { route } from "@/lib/api/handler";
import { listAdmins } from "@/lib/services/insights";

export const GET = route(async () => listAdmins(), { roles: ["admin"] });
