import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    idx[h.trim()] = i;
  });
  return idx;
}

function col(idx: Record<string, number>, row: string[], name: string): string {
  const i = idx[name];
  if (i === undefined) return "";
  return (row[i] ?? "").trim();
}

// One-time (re-runnable) bulk import of the legacy BrewHood Ledger export.
// Wipes sales/collections/manager_costs/skus/employees and reloads them
// from the four CSV exports of the old system, so it can safely be called
// again if the source data is corrected. Guarded by INIT_SECRET.
export async function POST(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const expected = process.env.INIT_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "INIT_SECRET is not configured on the server." }, { status: 500 });
  }
  if (key !== expected) {
    return NextResponse.json({ error: "Invalid or missing key." }, { status: 401 });
  }

  // Accepts multipart/form-data with file fields "employees", "skus",
  // "costs", "transactions" (each the raw CSV export from the old system).
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data body." }, { status: 400 });
  }
  const readField = async (name: string): Promise<string | undefined> => {
    const value = form.get(name);
    if (value === null) return undefined;
    if (typeof value === "string") return value;
    return await value.text();
  };
  const employeesCsv = await readField("employees");
  const skusCsv = await readField("skus");
  const costsCsv = await readField("costs");
  const transactionsCsv = await readField("transactions");

  // ---------- Parse employees ----------
  const employeeRows: { employee_id: string; name: string }[] = [];
  const empIdSet = new Set<string>();
  if (employeesCsv) {
    const rows = parseCsv(employeesCsv);
    const idx = buildIndex(rows[0] ?? []);
    for (const r of rows.slice(1)) {
      const employee_id = col(idx, r, "Employee ID");
      const name = col(idx, r, "Employee Name");
      if (!employee_id || !name || empIdSet.has(employee_id)) continue;
      empIdSet.add(employee_id);
      employeeRows.push({ employee_id, name });
    }
  }

  // ---------- Parse SKUs ----------
  const skuRows: { name: string; price: number; active: boolean }[] = [];
  const skuSeen = new Set<string>();
  if (skusCsv) {
    const rows = parseCsv(skusCsv);
    const idx = buildIndex(rows[0] ?? []);
    for (const r of rows.slice(1)) {
      const skuId = col(idx, r, "SKU ID");
      const name = col(idx, r, "SKU Name");
      if (!name) continue;
      if (/^test/i.test(name) || /^test/i.test(skuId)) continue;
      const key = name.toLowerCase();
      if (skuSeen.has(key)) continue;
      skuSeen.add(key);
      const price = Number(col(idx, r, "Price")) || 0;
      const active = col(idx, r, "Is Active") === "1";
      skuRows.push({ name, price, active });
    }
  }

  // ---------- Parse manager costs ----------
  const costRows: { category: string; amount: number; note: string | null; created_at: string }[] = [];
  if (costsCsv) {
    const rows = parseCsv(costsCsv);
    const idx = buildIndex(rows[0] ?? []);
    for (const r of rows.slice(1)) {
      const category = col(idx, r, "Cost Type") || "Other";
      const amount = Number(col(idx, r, "Amount")) || 0;
      const remark = col(idx, r, "Remark");
      const paidBy = col(idx, r, "Paid By");
      const createdAt = col(idx, r, "Timestamp") || col(idx, r, "Created At");
      if (!createdAt) continue;
      let note: string | null = remark || null;
      if (paidBy) {
        note = note ? `Paid by ${paidBy}. ${note}` : `Paid by ${paidBy}.`;
      }
      costRows.push({ category, amount, note, created_at: createdAt });
    }
  }

  // ---------- Parse transactions (sales + collections) ----------
  const saleRows: { employee_id: string; sku_name: string; total: number; created_at: string }[] = [];
  const collRows: { employee_id: string; amount: number; is_contra: boolean; created_at: string }[] = [];
  const transactionEmpIds = new Set<string>();
  if (transactionsCsv) {
    const rows = parseCsv(transactionsCsv);
    const idx = buildIndex(rows[0] ?? []);
    for (const r of rows.slice(1)) {
      const employee_id = col(idx, r, "Employee ID");
      const createdAt = col(idx, r, "Timestamp");
      if (!employee_id || !createdAt) continue;
      transactionEmpIds.add(employee_id);
      const type = col(idx, r, "Transaction Type");
      const amount = Number(col(idx, r, "Amount")) || 0;
      if (type === "sale") {
        const skuName = col(idx, r, "SKU Name") || "Item";
        saleRows.push({ employee_id, sku_name: skuName, total: amount, created_at: createdAt });
      } else if (type === "collection") {
        const notes = col(idx, r, "Notes");
        const isContra = /contra entry/i.test(notes);
        collRows.push({ employee_id, amount: Math.abs(amount), is_contra: isContra, created_at: createdAt });
      }
    }
  }

  // Any employee referenced by a transaction but missing from the ledger
  // export still needs a row so the sale/collection has somewhere to go.
  for (const id of transactionEmpIds) {
    if (!empIdSet.has(id)) {
      empIdSet.add(id);
      employeeRows.push({ employee_id: id, name: id });
    }
  }

  const db = sql();

  // ---------- Reset and reload ----------
  await db.query(
    "TRUNCATE TABLE sales, collections, manager_costs, skus, employees RESTART IDENTITY CASCADE"
  );

  const empIdMap = new Map<string, number>();
  if (employeeRows.length) {
    const ids = employeeRows.map((e) => e.employee_id);
    const names = employeeRows.map((e) => e.name);
    const inserted = (await db.query(
      `INSERT INTO employees (employee_id, name)
       SELECT * FROM unnest($1::text[], $2::text[])
       RETURNING id, employee_id`,
      [ids, names]
    )) as { id: number; employee_id: string }[];
    for (const row of inserted) empIdMap.set(row.employee_id, row.id);
  }

  const skuIdMap = new Map<string, number>();
  if (skuRows.length) {
    const names = skuRows.map((s) => s.name);
    const prices = skuRows.map((s) => s.price);
    const actives = skuRows.map((s) => s.active);
    const inserted = (await db.query(
      `INSERT INTO skus (name, price, active)
       SELECT * FROM unnest($1::text[], $2::numeric[], $3::boolean[])
       RETURNING id, name`,
      [names, prices, actives]
    )) as { id: number; name: string }[];
    for (const row of inserted) skuIdMap.set(row.name.toLowerCase(), row.id);
  }

  if (costRows.length) {
    const categories = costRows.map((c) => c.category);
    const amounts = costRows.map((c) => c.amount);
    const notes = costRows.map((c) => c.note);
    const createdAts = costRows.map((c) => c.created_at);
    await db.query(
      `INSERT INTO manager_costs (category, amount, note, created_at)
       SELECT * FROM unnest($1::text[], $2::numeric[], $3::text[], $4::timestamptz[])`,
      [categories, amounts, notes, createdAts]
    );
  }

  let salesInserted = 0;
  let salesSkipped = 0;
  if (saleRows.length) {
    const empIds: number[] = [];
    const skuIds: (number | null)[] = [];
    const skuNames: string[] = [];
    const quantities: number[] = [];
    const unitPrices: number[] = [];
    const totals: number[] = [];
    const createdAts: string[] = [];
    for (const s of saleRows) {
      const eid = empIdMap.get(s.employee_id);
      if (!eid) {
        salesSkipped++;
        continue;
      }
      empIds.push(eid);
      skuIds.push(skuIdMap.get(s.sku_name.toLowerCase()) ?? null);
      skuNames.push(s.sku_name);
      quantities.push(1);
      unitPrices.push(s.total);
      totals.push(s.total);
      createdAts.push(s.created_at);
      salesInserted++;
    }
    if (empIds.length) {
      await db.query(
        `INSERT INTO sales (employee_id, sku_id, sku_name, quantity, unit_price, total, created_at)
         SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::int[], $5::numeric[], $6::numeric[], $7::timestamptz[])`,
        [empIds, skuIds, skuNames, quantities, unitPrices, totals, createdAts]
      );
    }
  }

  let collInserted = 0;
  let collSkipped = 0;
  if (collRows.length) {
    const empIds: number[] = [];
    const amounts: number[] = [];
    const isContras: boolean[] = [];
    const createdAts: string[] = [];
    for (const c of collRows) {
      const eid = empIdMap.get(c.employee_id);
      if (!eid) {
        collSkipped++;
        continue;
      }
      empIds.push(eid);
      amounts.push(c.amount);
      isContras.push(c.is_contra);
      createdAts.push(c.created_at);
      collInserted++;
    }
    if (empIds.length) {
      await db.query(
        `INSERT INTO collections (employee_id, amount, is_contra, created_at)
         SELECT * FROM unnest($1::int[], $2::numeric[], $3::boolean[], $4::timestamptz[])`,
        [empIds, amounts, isContras, createdAts]
      );
    }
  }

  return NextResponse.json({
    ok: true,
    employees: employeeRows.length,
    skus: skuRows.length,
    costs: costRows.length,
    sales: { inserted: salesInserted, skipped: salesSkipped },
    collections: { inserted: collInserted, skipped: collSkipped },
  });
}
