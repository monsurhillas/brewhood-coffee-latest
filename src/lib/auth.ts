import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { TAB_KEYS, getAdminUserByEmail, touchLastLogin, type TabKey } from "@/lib/adminUsers";

// Google sign-in is checked against the admin_users allowlist (Admin tab).
// The username/password provider below is a temporary rollout fallback —
// see the comment on CredentialsProvider — and is NOT allowlist-checked:
// any existing manager_users row keeps the full access it always had.
export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 hours
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    // Fallback so nobody gets locked out while Google OAuth is being set
    // up. Once Google sign-in is confirmed working, this provider (and the
    // manager_users table) should be removed — ask Claude to do it.
    CredentialsProvider({
      name: "Manager Login",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const rows = await sql()`
          SELECT id, username, password_hash, name
          FROM manager_users
          WHERE username = ${credentials.username.trim().toLowerCase()}
          LIMIT 1
        `;
        const user = rows[0] as
          | { id: number; username: string; password_hash: string; name: string }
          | undefined;
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;

        return { id: String(user.id), name: user.name, username: user.username };
      },
    }),
  ],
  callbacks: {
    // Google accounts must be pre-approved in the Admin tab (or be the
    // hardcoded super admin) — everyone else is turned away here, before a
    // session is ever created. The credentials provider already validated
    // the password in authorize() above, so it's always allowed through.
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const email = profile?.email;
      if (!email) return false;

      const adminUser = await getAdminUserByEmail(email);
      if (!adminUser || !adminUser.active) {
        return "/login?error=NotAuthorized";
      }

      await touchLastLogin(email);
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.username = (user as { username?: string }).username;
        token.authMethod = account?.provider === "google" ? "google" : "credentials";
      }
      return token;
    },
    // Permissions are re-read from admin_users on every session check
    // (not baked into the JWT), so revoking or changing someone's access
    // in the Admin tab takes effect on their very next request instead of
    // waiting up to 12 hours for their token to expire.
    async session({ session, token }) {
      if (!session.user) return session;

      (session.user as { username?: string }).username = token.username as string | undefined;
      const authMethod = (token.authMethod as "google" | "credentials" | undefined) ?? "credentials";
      (session.user as { authMethod?: string }).authMethod = authMethod;

      if (authMethod === "credentials") {
        // Legacy fallback login always had unrestricted access — preserve
        // that so the rollout of Google sign-in isn't a regression.
        session.user.isSuperAdmin = true;
        session.user.allowedTabs = [...TAB_KEYS];
        return session;
      }

      const email = session.user.email;
      const adminUser = email ? await getAdminUserByEmail(email) : null;
      if (!adminUser || !adminUser.active) {
        // Deactivated after the JWT was issued: leave them "logged in" but
        // with zero access rather than silently trusting a stale token —
        // every tab and API route checks this and will refuse them.
        session.user.isSuperAdmin = false;
        session.user.allowedTabs = [];
        return session;
      }

      session.user.isSuperAdmin = adminUser.is_super_admin;
      session.user.allowedTabs = (adminUser.allowed_tabs ?? []).filter((t): t is TabKey =>
        (TAB_KEYS as readonly string[]).includes(t)
      );
      if (adminUser.name && !session.user.name) session.user.name = adminUser.name;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
