import { sql } from "@/lib/db";

// Optional transaction ID on a collection (bKash / bank only). Stored in its
// own column so it can be searched and shown separately from the free-text
// comment / reference in `note`.
//
// Self-healing lazy migration (same pattern as ensureUploadedAtColumn): adds
// the column, then — exactly once, claimed atomically through app_migrations —
// fills it from transaction IDs that were previously typed into the note
// (reference) field. The note itself is never modified; the ledger simply
// hides a note that is identical to the ID so nothing shows twice.

export const TRX_ID_MAX_LENGTH = 64;

// Returns a cleaned ID, null for "none", or undefined when it's invalid.
export function normalizeTrxId(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return null;
  if (v.length > TRX_ID_MAX_LENGTH) return undefined;
  return v;
}

// Pulls a transaction ID out of a free-text reference, conservatively:
//  1. "TrxID: 9AB12CD34E", "txn no 123456", "Transaction ID - ABC123XYZ"
//  2. the whole note is a single code (letters/digits, 8-20 chars, has a digit)
//  3. a bKash-style token: 8-12 UPPERCASE letters+digits containing both
// Anything ambiguous is left alone (the note stays as the reference).
export function extractTrxId(note: string | null | undefined): string | null {
  if (!note) return null;
  const text = note.trim();
  if (!text) return null;

  const labelled = text.match(
    /\b(?:trx|txn|tnx|trans(?:action)?)\s*(?:id|no\.?|number|ref)?\s*[:#=\-]?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{5,31})\b/i
  );
  if (labelled && /\d/.test(labelled[1])) return labelled[1];

  if (/^[A-Za-z0-9]{8,20}$/.test(text) && /\d/.test(text)) return text;

  const bkash = text.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/);
  if (bkash) return bkash[0];

  return null;
}

let _trxEnsured = false;
export async function ensureCollectionTrxColumn(): Promise<void> {
  if (_trxEnsured) return;
  const db = sql();
  await db.query(`ALTER TABLE collections ADD COLUMN IF NOT EXISTS trx_id TEXT`);
  await db.query(`CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now())`);
  const claimed = (await db.query(
    `INSERT INTO app_migrations (name) VALUES ('collection_trx_backfill_v1')
     ON CONFLICT (name) DO NOTHING RETURNING name`
  )) as { name: string }[];
  if (claimed.length > 0) {
    try {
      const rows = (await db.query(
        `SELECT id, note FROM collections
         WHERE trx_id IS NULL AND note IS NOT NULL AND method IN ('bkash', 'bank')`
      )) as { id: number; note: string }[];
      const ids: number[] = [];
      const trxs: string[] = [];
      for (const r of rows) {
        const t = extractTrxId(r.note);
        if (t) {
          ids.push(r.id);
          trxs.push(t);
        }
      }
      if (ids.length) {
        await db.query(
          `UPDATE collections c SET trx_id = v.trx
           FROM (SELECT * FROM unnest($1::int[], $2::text[]) AS t(id, trx)) v
           WHERE c.id = v.id AND c.trx_id IS NULL`,
          [ids, trxs]
        );
      }
    } catch (err) {
      // Let the next request retry the backfill.
      await db.query(`DELETE FROM app_migrations WHERE name = 'collection_trx_backfill_v1'`);
      throw err;
    }
  }
  _trxEnsured = true;
}
