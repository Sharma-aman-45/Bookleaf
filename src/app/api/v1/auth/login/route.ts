import { NextResponse, type NextRequest } from "next/server";
import { sessionClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/api/schemas";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { readJson } from "@/lib/api/handler";
import { loadProfile } from "@/lib/api/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = loginSchema.parse(await readJson(req));
    const supabase = await sessionClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new ApiError(401, "UNAUTHENTICATED", "Email or password is incorrect.");

    const profile = await loadProfile(data.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      throw ApiError.forbidden("This account is not linked to a BookLeaf profile.");
    }

    return NextResponse.json({
      data: {
        user: profile,
        access_token: data.session.access_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
