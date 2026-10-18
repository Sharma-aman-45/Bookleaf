import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { SessionProvider } from "@/components/SessionContext";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/author/books", label: "My books" },
  { href: "/author/tickets", label: "My tickets", exact: true },
  { href: "/author/tickets/new", label: "Ask a question", exact: true }
];

export default async function AuthorLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser("author");
  return (
    <SessionProvider user={user}>
      <Shell user={user} nav={NAV}>
        {children}
      </Shell>
    </SessionProvider>
  );
}
