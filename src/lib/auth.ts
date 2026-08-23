import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";

export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 hours
  },
  pages: {
    signIn: "/login",
  },
  providers: [
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
    async jwt({ token, user }) {
      if (user) {
        token.username = (user as { username?: string }).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { username?: string }).username = token.username as string | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
