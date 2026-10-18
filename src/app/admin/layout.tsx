import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { SessionProvider } from "@/components/SessionContext";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Ticket queue", exact: true },
  { href: "/admin/insights", label: "AI and team insights" },
  { href: "/docs", label: "API reference" }
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser("admin");
  return (
    <SessionProvider user={user}>
      <Shell user={user} nav={NAV}>
        {children}
      </Shell>
    </SessionProvider>
  );
}
