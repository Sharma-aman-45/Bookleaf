"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { post, ApiClientError } from "@/lib/client/api";
import type { SessionUser } from "@/lib/domain/types";

const SPINES = [
  { w: 30, h: 62, c: "var(--coral)", d: 0 },
  { w: 42, h: 80, c: "var(--blush)", d: 60 },
  { w: 24, h: 70, c: "var(--coral-deep)", d: 120 },
  { w: 36, h: 92, c: "var(--coral)", d: 180 },
  { w: 28, h: 58, c: "var(--cream-deep)", d: 240 },
  { w: 46, h: 76, c: "var(--blush)", d: 300 },
  { w: 26, h: 88, c: "var(--coral)", d: 360, lean: true },
  { w: 34, h: 66, c: "var(--coral-deep)", d: 420 },
  { w: 22, h: 54, c: "var(--blush)", d: 480 },
  { w: 40, h: 84, c: "var(--coral)", d: 540 }
];

const DEMO_ACCOUNTS = [
  { label: "Operations admin", email: "admin@bookleaf.in", password: "Admin@123" },
  ...(process.env.NEXT_PUBLIC_DEMO_AUTHOR_EMAIL
    ? [
        {
          label: "Sample author",
          email: process.env.NEXT_PUBLIC_DEMO_AUTHOR_EMAIL,
          password: process.env.NEXT_PUBLIC_DEMO_AUTHOR_PASSWORD ?? "Author@123"
        }
      ]
    : [])
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ user: SessionUser }>("/auth/login", { email, password });
      router.replace(result.user.role === "admin" ? "/admin" : "/author");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not sign in. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div>
          <img src="/logo.png" alt="BookLeaf Publishing" />
          <h1>Your books, your royalties, your questions answered.</h1>
          <p>
            Track sales and payouts for every title, raise a question about any book, and follow the
            reply from our author support team as it happens.
          </p>
        </div>
        <div className="spines" aria-hidden>
          {SPINES.map((s, i) => (
            <span
              key={i}
              className={s.lean ? "lean" : undefined}
              style={{ ["--w" as string]: `${s.w}px`, ["--h" as string]: `${s.h}%`, ["--c" as string]: s.c, ["--d" as string]: `${s.d}ms` }}
            />
          ))}
        </div>
      </section>

      <section className="login-form">
        <form onSubmit={submit} noValidate>
          <div>
            <h2>Sign in</h2>
            <p className="muted">Authors and the BookLeaf operations team use the same sign-in.</p>
          </div>

          {error && (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          )}

          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>

          {DEMO_ACCOUNTS.length > 0 && (
            <div className="demo">
              <span className="muted">Test accounts</span>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                >
                  <strong>{a.label}</strong>
                  <br />
                  <span className="faint">{a.email}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
