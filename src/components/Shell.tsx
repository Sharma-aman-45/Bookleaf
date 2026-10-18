"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { post } from "@/lib/client/api";
import type { SessionUser } from "@/lib/domain/types";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export function Shell({ user, nav, children }: { user: SessionUser; nav: NavItem[]; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await post("/auth/logout");
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href={user.role === "admin" ? "/admin" : "/author"} aria-label="BookLeaf home">
          <img src="/logo.png" alt="BookLeaf Publishing" />
        </Link>
        <nav className="nav" aria-label="Main">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>
            <strong>{user.fullName}</strong>
            <span className="faint">{user.role === "admin" ? "Operations team" : user.email}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
