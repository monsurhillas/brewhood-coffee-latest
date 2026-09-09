"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  // Re-check the session every 5 minutes even if the tab just sits open and
  // focused (e.g. a register left on the dashboard all shift) — otherwise a
  // stale tab wouldn't notice its session expired until the next click hit
  // an API route. DashboardShell watches useSession()'s status and redirects
  // to /login once this poll reports "unauthenticated".
  return <SessionProvider refetchInterval={5 * 60}>{children}</SessionProvider>;
}
