import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { bestMatch } from "@/lib/similarity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Google's Gemini API has a genuinely free tier (no card required to start —
// get a key at https://aistudio.google.com/apikey) with native PDF/vision
// understanding, so the Bulk Upload OCR doesn't depend on a paid Anthropic
// key. Configurable so the model can be bumped in Vercel env vars without a
// code change as newer Gemini models ship.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

type ExtractedItem = {
  item: string;
  quantity: number;
};

type ExtractedRow = {
  sl: number;
  name: string;
  items_sold: ExtractedItem[];
  collection: { method: string; amount: number } | null;
};

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not configured. Get a free key at aistudio.google.com/apikey, add it under Vercel → Project Settings → Environment Variables, then redeploy.",
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const pdfBase64: string | undefined = body?.pdf_base64;
  if (!pdfBase64) {
    return NextResponse.json({ error: "pdf_base64 is required." }, { status: 400 });
  }

  const db = sql();
  const [skus, employees] = await Promise.all([
    db`SELECT id, name, price::float8 AS price FROM skus WHERE active ORDER BY name`,
    db`SELECT id, employee_id, name FROM employees WHERE active ORDER BY name`,
  ]);

  const skuList = skus as { id: number; name: string; price: number }[];
  const employeeList = employees as { id: number; employee_id: string; name: string }[];

  if (skuList.length === 0) {
    return NextResponse.json(
      { error: "No active SKUs configured. Add your menu items under the SKUs tab first." },
      { status: 400 }
    );
  }

  const itemNames = skuList.map((s) => s.name);

  // Gemini's structured-output schema is a constrained subset of OpenAPI 3.0
  // (uppercase type names, "nullable" instead of a ["x","null"] type union).
  const responseSchema = {
    type: "OBJECT",
    properties: {
      date: {
        type: "STRING",
        nullable: true,
        description:
          "The date handwritten next to 'Date:' at the top of the sheet, normalized to YYYY-MM-DD. Null if illegible or blank.",
      },
      rows: {
        type: "ARRAY",
        description: "One entry per filled-in row of the table. Skip rows where no name is written at all.",
        items: {
          type: "OBJECT",
          properties: {
            sl: { type: "INTEGER", description: "The serial number (SL) printed on that row." },
            name: {
              type: "STRING",
              description:
                "The employee's name exactly as handwritten — a best-effort transcription, do not correct spelling.",
            },
            items_sold: {
              type: "ARRAY",
              description:
                "One entry per menu-item checkbox that is ticked/checked in this row. Empty array if no item box is ticked.",
              items: {
                type: "OBJECT",
                properties: {
                  item: { type: "STRING", enum: itemNames },
                  quantity: {
                    type: "INTEGER",
                    description:
                      "Almost always 1 — a plain tick means one unit. Only use a higher number when the employee wrote an explicit handwritten multiplier on the right-hand side of that item's checkbox, such as '2X', 'x2', or '3X', to record buying several of that same item in one line. This handwritten scribble is completely different from the two PRINTED column headers 'Americano 2X' and 'Espresso 2X', which are their own separate double-shot menu items with their own checkbox column — a tick in one of those columns is quantity 1 of that double-shot item, not a multiplier.",
                  },
                },
                required: ["item", "quantity"],
              },
            },
            collection: {
              type: "OBJECT",
              nullable: true,
              description:
                "Present only if the Payment Method box (Cash or Bkash) is ticked AND a collection amount is handwritten for this row. Null otherwise.",
              properties: {
                method: { type: "STRING", enum: ["cash", "bkash"] },
                amount: { type: "NUMBER" },
              },
              required: ["method", "amount"],
            },
          },
          required: ["sl", "name", "items_sold"],
        },
      },
    },
    required: ["date", "rows"],
  };

  const promptText = [
    "This is a handwritten BrewHood 'Daily Sales & Collection Log'.",
    "Each row has: a serial number (SL), an employee Name (handwritten, often just a first name or nickname, sometimes with a Bangla honorific like 'vai' or 'bhai' after it — transcribe it exactly as written, do not expand or correct it), a Payment Method with Cash/Bkash checkboxes plus a handwritten Amount (filled in only when a collection happened that day for that employee), and one checkbox column per menu item — a checked box means that employee bought that item that day.",
    "Some rows have a small handwritten multiplier such as '2X', 'x2', or '3X' written on the right-hand side of a ticked item's checkbox — that means the employee bought that many units of that same item, not one. Only treat it as a multiplier when it's clearly a handwritten addition next to a tick, not the sheet's own printed column headers — 'Americano 2X' and 'Espresso 2X' are separate, distinct printed menu-item columns (a double-shot variant with its own checkbox), and a plain tick in one of those columns is quantity 1 of that item, never a multiplier.",
    "Read every handwritten mark carefully, including faint, small, or ambiguous ticks — a tick can be a check, an X, or a filled-in box.",
    "Only include rows where a name is actually written in them. Extract the date written in the 'Date:' field at the top of the page.",
  ].join(" ");

  let geminiRes: Response;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
                { text: promptText },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.1,
          },
        }),
      }
    );
  } catch {
    return NextResponse.json({ error: "Could not reach the OCR service. Check your network and try again." }, { status: 502 });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    return NextResponse.json(
      { error: `OCR request failed (${geminiRes.status}): ${errText.slice(0, 500)}` },
      { status: 502 }
    );
  }

  const geminiData = await geminiRes.json();
  const finishReason = geminiData?.candidates?.[0]?.finishReason;
  const rawText: string | undefined = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    const blockReason = geminiData?.promptFeedback?.blockReason;
    return NextResponse.json(
      {
        error: blockReason
          ? `The OCR service declined to read this file (${blockReason}). Try a clearer scan or photo.`
          : "The model did not return structured data. Try a clearer scan or photo.",
      },
      { status: 502 }
    );
  }

  let extracted: { date: string | null; rows: ExtractedRow[] };
  try {
    extracted = JSON.parse(rawText);
  } catch {
    return NextResponse.json(
      { error: "The model's response could not be parsed. Try again, or use a clearer scan." },
      { status: 502 }
    );
  }

  if (finishReason === "MAX_TOKENS") {
    return NextResponse.json(
      { error: "The sheet had too many filled rows to read in one pass. Try splitting it into two uploads." },
      { status: 502 }
    );
  }

  const skuByName = new Map(skuList.map((s) => [s.name, s]));
  const employeeCandidates = employeeList.map((e) => ({ ...e, label: e.name }));

  // Below this, the best guess is more likely wrong than right — leave the
  // employee unset rather than silently attaching sales to the wrong person;
  // the manager picks manually from the dropdown instead.
  const MIN_CONFIDENCE_TO_AUTOFILL = 0.5;
  const LOW_CONFIDENCE_THRESHOLD = 0.72;

  const rows = (extracted.rows ?? []).map((row) => {
    const match = bestMatch(row.name, employeeCandidates);
    const confidentEnough = match.score >= MIN_CONFIDENCE_TO_AUTOFILL;
    const sales = (row.items_sold ?? [])
      .map((entry) => {
        const sku = skuByName.get(entry.item);
        if (!sku) return null;
        const quantity = Math.max(1, Math.round(entry.quantity || 1));
        return { sku_id: sku.id, sku_name: sku.name, quantity, unit_price: sku.price };
      })
      .filter((s): s is { sku_id: number; sku_name: string; quantity: number; unit_price: number } => s !== null);

    return {
      sl: row.sl,
      raw_name: row.name,
      matched_employee:
        match.candidate && confidentEnough
          ? { id: match.candidate.id, employee_id: match.candidate.employee_id, name: match.candidate.name }
          : null,
      match_confidence: Math.round(match.score * 100) / 100,
      low_confidence: !confidentEnough || match.score < LOW_CONFIDENCE_THRESHOLD,
      sales,
      collection: row.collection ? { method: row.collection.method, amount: row.collection.amount } : null,
    };
  });

  return NextResponse.json({ date: extracted.date, rows });
}
