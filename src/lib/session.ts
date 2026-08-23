import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Defense-in-depth: proxy.ts already blocks unauthenticated requests to
// protected routes, but API route handlers double-check the session before
// touching the database.
export async function requireSession() {
  const session = await getServerSession(authOptions);
  return session;
}
