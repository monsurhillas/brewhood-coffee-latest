"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  NotAuthorized:
    "That Google account isn't authorized yet. Ask your admin to add your email in the Admin tab.",
  AccessDenied: "Access denied. Ask your admin to add your email in the Admin tab.",
  SessionExpired: "You've been signed out after 8 hours for security. Please sign in again.",
};

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/dashboard";
  const oauthError = searchParams.get("error");

  const [showFallback, setShowFallback] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: from });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid username or password.");
      return;
    }
    router.push(from);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand)] text-xl text-white">
          ☕
        </div>
        <h1 className="text-lg font-semibold">Manager Login</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Sign in to BrewHood Coffee dashboard</p>
      </div>

      {oauthError && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-500">
          {ERROR_MESSAGES[oauthError] ?? "Sign-in failed. Please try again."}
        </p>
      )}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
          />
        </svg>
        {googleLoading ? "Redirecting…" : "Sign in with Google"}
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-[var(--muted)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <button type="button" onClick={() => setShowFallback((v) => !v)} className="hover:text-[var(--brand)]">
          {showFallback ? "Hide fallback login" : "Use fallback login instead"}
        </button>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      {showFallback && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Username
            <input
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--brand)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--brand)]"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-[var(--muted)]">
        <Link href="/" className="hover:text-[var(--brand)]">
          ← Back to Public Ledger
        </Link>
      </p>
    </div>
  );
}
