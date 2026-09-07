import { sql } from "@/lib/db";

// The one email that can never be locked out of its own dashboard,
// regardless of what the admin_users table says. Hardcoded (not just a
// DB flag) so a bug or a bad edit in the Admin tab can never strip access
// from the person who owns the shop.
export const SUPER_ADMIN_EMAIL = "hillas@shopup.org";

// Every dashboard section a user's access can be scoped to. Keep this in
// sync with the `key` values in DashboardShell's TABS array — the Admin
// tab is deliberately excluded from what's assignable (see AdminTab):
// only the super admin can ever manage other users.
export const TAB_KEYS = [
  "sale",
  "collection",
  "cost",
  "bulk",
  "invoices",
  "ledger",
  "analytics",
  "reports",
  "download",
  "skus",
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

export function isTabKey(value: unknown): value is TabKey {
  return typeof value === "string" && (TAB_KEYS as readonly string[]).includes(value);
}

export type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  is_super_admin: boolean;
  allowed_tabs: TabKey[];
  active: boolean;
  created_at: string;
  created_by: string | null;
  last_login_at: string | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Idempotent, self-healing (same pattern as ensureUploadedAtColumn): makes
// sure the table exists and the super admin row is present and correctly
// flagged, without requiring a re-run of /api/init. Safe to call on every
// Google sign-in attempt.
let _adminUsersEnsured = false;
export async function ensureAdminUsersTable(): Promise<void> {
  if (_adminUsersEnsured) return;
  const db = sql();
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      is_super_admin BOOLEAN NOT NULL DEFAULT false,
      allowed_tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      created_by TEXT,
      last_login_at TIMESTAMPTZ
    )
  `);
  await db`
    INSERT INTO admin_users (email, name, is_super_admin, allowed_tabs, active, created_by)
    VALUES (${SUPER_ADMIN_EMAIL}, 'Super Admin', true, '[]'::jsonb, true, 'system')
    ON CONFLICT (email) DO UPDATE SET is_super_admin = true, active = true
  `;
  _adminUsersEnsured = true;
}

export async function getAdminUserByEmail(email: string): Promise<AdminUser | null> {
  await ensureAdminUsersTable();
  const db = sql();
  const rows = await db`
    SELECT id, email, name, is_super_admin, allowed_tabs, active, created_at, created_by, last_login_at
    FROM admin_users WHERE email = ${normalizeEmail(email)} LIMIT 1
  `;
  return (rows[0] as AdminUser) ?? null;
}

export async function touchLastLogin(email: string): Promise<void> {
  const db = sql();
  await db`UPDATE admin_users SET last_login_at = now() WHERE email = ${normalizeEmail(email)}`;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  await ensureAdminUsersTable();
  const db = sql();
  const rows = await db`
    SELECT id, email, name, is_super_admin, allowed_tabs, active, created_at, created_by, last_login_at
    FROM admin_users ORDER BY is_super_admin DESC, created_at ASC
  `;
  return rows as AdminUser[];
}

export async function addAdminUser(params: {
  email: string;
  name?: string | null;
  allowedTabs: TabKey[];
  createdBy: string;
}): Promise<AdminUser> {
  await ensureAdminUsersTable();
  const db = sql();
  const email = normalizeEmail(params.email);
  const rows = await db`
    INSERT INTO admin_users (email, name, is_super_admin, allowed_tabs, active, created_by)
    VALUES (${email}, ${params.name ?? null}, false, ${JSON.stringify(params.allowedTabs)}::jsonb, true, ${params.createdBy})
    ON CONFLICT (email) DO UPDATE SET
      allowed_tabs = ${JSON.stringify(params.allowedTabs)}::jsonb,
      active = true,
      name = COALESCE(${params.name ?? null}, admin_users.name)
    RETURNING id, email, name, is_super_admin, allowed_tabs, active, created_at, created_by, last_login_at
  `;
  return rows[0] as AdminUser;
}

export async function updateAdminUser(
  id: number,
  params: { allowedTabs?: TabKey[]; active?: boolean; name?: string | null }
): Promise<AdminUser | null> {
  const db = sql();
  const existingRows = await db`SELECT email, is_super_admin FROM admin_users WHERE id = ${id} LIMIT 1`;
  const existing = existingRows[0] as { email: string; is_super_admin: boolean } | undefined;
  if (!existing) return null;

  // The super admin's own row can't be deactivated or have tabs touched —
  // they always have full access by virtue of is_super_admin, and this
  // guarantees nobody (including a mistaken click) can lock the shop
  // owner out of their own dashboard.
  if (existing.is_super_admin) {
    return getAdminUserByEmail(existing.email);
  }

  const rows = await db`
    UPDATE admin_users SET
      allowed_tabs = COALESCE(${params.allowedTabs ? JSON.stringify(params.allowedTabs) : null}::jsonb, allowed_tabs),
      active = COALESCE(${params.active ?? null}, active),
      name = COALESCE(${params.name ?? null}, name)
    WHERE id = ${id}
    RETURNING id, email, name, is_super_admin, allowed_tabs, active, created_at, created_by, last_login_at
  `;
  return (rows[0] as AdminUser) ?? null;
}

export async function deleteAdminUser(id: number): Promise<{ ok: boolean; error?: string }> {
  const db = sql();
  const rows = await db`SELECT is_super_admin FROM admin_users WHERE id = ${id} LIMIT 1`;
  const existing = rows[0] as { is_super_admin: boolean } | undefined;
  if (!existing) return { ok: false, error: "User not found." };
  if (existing.is_super_admin) {
    return { ok: false, error: "The super admin account can't be removed." };
  }
  await db`DELETE FROM admin_users WHERE id = ${id}`;
  return { ok: true };
}
