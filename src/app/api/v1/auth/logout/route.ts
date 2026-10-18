import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  return NextResponse.json({ data: { signed_out: true } });
}
