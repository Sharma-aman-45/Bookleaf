import { route } from "@/lib/api/handler";

export const GET = route(async ({ user }) => user);
