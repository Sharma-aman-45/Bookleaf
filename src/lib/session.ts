import "server-only";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/api/auth";
import type { UserRole } from "@/lib/domain/constants";
import type { SessionUser } from "@/lib/domain/types";

export async function requirePageUser(role: UserRole): Promise<SessionUser> {
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const profile = await loadProfile(data.user.id);
  if (!profile) redirect("/login");
  if (profile.role !== role) redirect(profile.role === "admin" ? "/admin" : "/author");
  return profile;
}
