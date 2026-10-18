import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const HOME: Record<string, string> = { admin: "/admin", author: "/author" };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const role = (user?.app_metadata?.role as string | undefined) ?? null;
  const path = request.nextUrl.pathname;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (path.startsWith("/author") || path.startsWith("/admin")) {
    if (!user) return redirect("/login");
    const area = path.startsWith("/admin") ? "admin" : "author";
    if (role && role !== area) return redirect(HOME[role] ?? "/login");
  }

  if ((path === "/login" || path === "/") && user && role && HOME[role]) return redirect(HOME[role]);
  if (path === "/") return redirect("/login");

  return response;
}

export const config = {
  matcher: ["/", "/login", "/author/:path*", "/admin/:path*"]
};
