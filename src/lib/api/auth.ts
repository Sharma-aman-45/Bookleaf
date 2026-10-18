import "server-only";
import type { NextRequest } from "next/server";
import { db } from "@/lib/supabase/admin";
import { sessionClient } from "@/lib/supabase/server";
import { ApiError } from "./errors";
import type { SessionUser } from "@/lib/domain/types";

async function userIdFromRequest(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const { data, error } = await db().auth.getUser(token);
    if (error || !data.user) throw ApiError.unauthenticated("Your access token is invalid or expired.");
    return data.user.id;
  }
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function loadProfile(userId: string): Promise<SessionUser | null> {
  const { data } = await db()
    .from("profiles")
    .select("id, email, role, full_name, author_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    role: data.role,
    fullName: data.full_name,
    authorId: data.author_id
  };
}

export async function authenticate(req: NextRequest): Promise<SessionUser> {
  const userId = await userIdFromRequest(req);
  if (!userId) throw ApiError.unauthenticated();
  const profile = await loadProfile(userId);
  if (!profile) throw ApiError.forbidden("Your account is not linked to a BookLeaf profile.");
  return profile;
}
