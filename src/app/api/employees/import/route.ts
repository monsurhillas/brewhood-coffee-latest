import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { parseCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Protected: bulk-add employees from a CSV with headers
// employee_id,name,phone,role (phone/role optional).
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const csv: string | undefined = body?.csv;
  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ error: "Missing CSV text." }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV needs a header row plus at least one data row." },
      { status: 400 }
    );
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idIdx = header.indexOf("employee_id");
  const nameIdx = header.indexOf("name");
  const phoneIdx = header.indexOf("phone");
  const roleIdx = header.indexOf("role");

  if (idIdx === -1 || nameIdx === -1) {
    return NextResponse.json(
      { error: "CSV header must include at least employee_id,name columns." },
      { status: 400 }
    );
  }

  const db = sql();
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const employeeId = r[idIdx]?.trim();
    const name = r[nameIdx]?.trim();
    const phone = phoneIdx !== -1 ? r[phoneIdx]?.trim() || null : null;
    const role = roleIdx !== -1 ? r[roleIdx]?.trim() || null : null;

    if (!employeeId || !name) {
      errors.push(`Row ${i + 1}: employee_id and name are required.`);
      continue;
    }

    try {
      const result = await db`
        INSERT INTO employees (employee_id, name, phone, role)
        VALUES (${employeeId}, ${name}, ${phone}, ${role})
        ON CONFLICT (employee_id)
        DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, role = EXCLUDED.role
        RETURNING (xmax = 0) AS inserted
      `;
      if (result[0]?.inserted) created++;
      else updated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Row ${i + 1} (${employeeId}): ${message}`);
    }
  }

  return NextResponse.json({ created, updated, errors });
}
