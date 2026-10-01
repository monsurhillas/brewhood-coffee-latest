import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireTab } from "@/lib/session";

export const dynamic = "force-dynamic";

// Removes a mistaken advance entry.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireTab("salary");
  if (response) return response;

  const { id } = await params;
  const db = sql();
  await db`DELETE FROM salary_advances WHERE id = ${Number(id)}`;
  return NextResponse.json({ ok: true });
}
