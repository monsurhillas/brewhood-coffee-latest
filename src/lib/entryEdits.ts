// Corrections to already-recorded Sales, Collections and Manager Costs.
//
// Ledger entries used to be permanent (mistakes were fixed with a contra
// entry). Typos in a date or a quantity are common enough that the manager can
// now fix an entry in place — but never silently: every edit needs a written
// remark, is limited to entries dated within the last EDIT_WINDOW_DAYS days,
// and is logged in entry_edits (when, by whom, why, and old -> new for each
// field) so the Sale / Collection / Cost tabs can show an "Edited" badge with
// the full history on hover. The entry row itself holds the corrected values,
// so balances, reports, analytics and exports all pick the fix up unchanged.
//
// The history is only ever read by the manager dashboard routes; the public
// ledger / share-page routes never select from this table.

import { sql } from "@/lib/db";

export const EDIT_WINDOW_DAYS = 30;
export const REMARKS_MIN = 3;
export const REMARKS_MAX = 500;

export type EntryType = "sale" | "collection" | "cost";
export function isEntryType(v: unknown): v is EntryType {
  return v === "sale" || v === "collection" || v === "cost";
}

export type FieldKind = "money" | "date" | "text" | "number";
export type EditChange = { field: string; label: string; kind: FieldKind; from: string | number | null; to: string | number | null };
export type EditRecord = {
  id: number;
  entry_id: number;
  edited_at: string;
  edited_by: string | null;
  remarks: string;
  changes: EditChange[];
};

let _ensured = false;
export async function ensureEntryEditsTable(): Promise<void> {
  if (_ensured) return;
  const db = sql();
  await db.query(`
    CREATE TABLE IF NOT EXISTS entry_edits (
      id SERIAL PRIMARY KEY,
      entry_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      edited_by TEXT,
      remarks TEXT NOT NULL,
      changes JSONB NOT NULL
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_entry_edits_entry ON entry_edits(entry_type, entry_id)`);
  _ensured = true;
}

// SQL fragment (Dhaka calendar days, like the rest of the app): is the entry
// dated within the last EDIT_WINDOW_DAYS days? `col` is a trusted column name.
export function inWindowSql(col: string): string {
  return `((${col} AT TIME ZONE 'Asia/Dhaka')::date >= (now() AT TIME ZONE 'Asia/Dhaka')::date - ${EDIT_WINDOW_DAYS})`;
}

// Edit history for a page of rows: entry_id -> newest-first list of edits.
export async function loadEdits(type: EntryType, ids: number[]): Promise<Map<number, EditRecord[]>> {
  const out = new Map<number, EditRecord[]>();
  if (ids.length === 0) return out;
  await ensureEntryEditsTable();
  const rows = (await sql()`
    SELECT id, entry_id, edited_at, edited_by, remarks, changes
    FROM entry_edits
    WHERE entry_type = ${type} AND entry_id = ANY(${ids})
    ORDER BY edited_at DESC, id DESC
  `) as EditRecord[];
  for (const r of rows) {
    const list = out.get(r.entry_id) ?? [];
    list.push(r);
    out.set(r.entry_id, list);
  }
  return out;
}

export async function withEdits<T extends { id: number }>(type: EntryType, rows: T[]): Promise<(T & { edits: EditRecord[] })[]> {
  const map = await loadEdits(type, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, edits: map.get(r.id) ?? [] }));
}

export function cleanRemarks(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/\s+/g, " ");
  if (v.length < REMARKS_MIN || v.length > REMARKS_MAX) return null;
  return v;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const sameNum = (a: number, b: number) => Math.abs(a - b) < 0.005;
