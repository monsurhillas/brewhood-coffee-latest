// Shared between src/lib/auth.ts (Node) and src/proxy.ts (Edge middleware),
// so this file is deliberately tiny and import-free — both runtimes can pull
// it in without dragging bcryptjs/DB code into the edge bundle.

// Hard cap on how long a signed-in session lasts, counted from the moment
// the manager originally signed in — NOT reset by activity. NextAuth's own
// `session.maxAge` is a *sliding* window on its own: the session endpoint
// re-issues the cookie with a fresh maxAge on every check (page load, tab
// focus, periodic client poll), so an active user would otherwise never get
// logged out. Stamping `loginTime` into the token at sign-in and checking it
// here gives a real, fixed-length session on top of that — roughly one work
// shift, whether the manager is active the whole time or not.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export function isSessionExpired(loginTime: unknown): boolean {
  return typeof loginTime !== "number" || Date.now() - loginTime > SESSION_MAX_AGE_SECONDS * 1000;
}
