import type { DefaultSession } from "next-auth";
import type { TabKey } from "@/lib/adminUsers";

declare module "next-auth" {
  interface Session {
    user: {
      username?: string;
      isSuperAdmin?: boolean;
      allowedTabs?: TabKey[];
      authMethod?: "google" | "credentials";
    } & DefaultSession["user"];
  }
}
