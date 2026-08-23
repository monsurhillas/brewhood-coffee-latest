import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { SCHEMA_STATEMENTS } from "@/lib/schema";

export const dynamic = "force-dynamic";

// One-time setup endpoint: creates tables (idempotent) and, if no manager
// account exists yet, creates a default admin so the very first login is
// possible. Guarded by INIT_SECRET so it can't be run by strangers.
export async function POST(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const expected = process.env.INIT_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "INIT_SECRET is not configured on the server." },
      { status: 500 }
    );
  }
  if (key !== expected) {
    return NextResponse.json({ error: "Invalid or missing key." }, { status: 401 });
  }

  const db = sql();

  for (const statement of SCHEMA_STATEMENTS) {
    await db.query(statement);
  }

  const existing = await db`SELECT id FROM manager_users LIMIT 1`;

  let seededAdmin: { username: string; password: string } | null = null;

  if (existing.length === 0) {
    // Allow the caller to specify the initial admin's username/password via
    // the request body; fall back to a random default if not provided.
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const username =
      typeof body.username === "string" && body.username.trim() ? body.username.trim() : "admin";
    const password =
      typeof body.password === "string" && body.password.length >= 6
        ? body.password
        : Math.random().toString(36).slice(-10) + "A1!";
    const passwordHash = await bcrypt.hash(password, 10);
    await db`
      INSERT INTO manager_users (username, password_hash, name)
      VALUES (${username.toLowerCase()}, ${passwordHash}, 'Admin')
    `;
    seededAdmin = { username, password };
  }

  return NextResponse.json({
    ok: true,
    message: "Database schema is ready.",
    seededAdmin,
  });
}
