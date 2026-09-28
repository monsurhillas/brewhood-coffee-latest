"use client";

import { formatMoney } from "@/lib/format";

// BrewHood's actual bKash Merchant Account number (Bangla QR) — this is a
// Payment/Merchant QR, not a Send Money number. Paying it goes through the
// bKash app's "Payment" flow (scan or enter this as the Merchant number),
// never "Send Money" — Send Money moves cash between personal wallets and
// doesn't reach the shop's merchant account the same way.
export const BKASH_NUMBER = "01321204763";

export type PayableEmployee = {
  name: string;
  employee_id: string;
  balance: number;
};

export function paymentReference(employee: PayableEmployee): string {
  return `${employee.name} (${employee.employee_id})`;
}

// Shared by the public directory's transaction modal (LedgerHome) and each
// employee's own dedicated share-link page (/e/[id]) — one place owns the
// bKash "Scan to Pay" presentation so both surfaces stay in sync.
//
// mode "due" (default) is for settling an existing negative balance — shows
// the fixed amount owed. mode "advance" is for someone proactively paying an
// employee ahead of time (no fixed amount; the payer decides how much), used
// on the employee's own share page regardless of their current balance.
export default function ScanToPayModal({
  employee,
  mode = "due",
  onClose,
}: {
  employee: PayableEmployee;
  mode?: "due" | "advance";
  onClose: () => void;
}) {
  const due = -employee.balance;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-2xl bg-[var(--card)] p-6 text-center sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between text-left">
          <div>
            <h2 className="text-base font-semibold">{employee.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              {mode === "due" ? (
                <>
                  Amount due <span className="font-semibold text-red-500">{formatMoney(due)}</span>
                </>
              ) : (
                "Give an advance — pay any amount"
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Close
          </button>
        </div>

        <img
          src="/bkash-qr.png"
          alt="BrewHood Coffee bKash Merchant QR — scan in the bKash app to pay"
          className="mx-auto w-full max-w-[240px] rounded-xl border border-[var(--border)]"
        />

        <p className="mt-3 text-xs text-[var(--muted)]">
          Scan with the bKash app, or open <span className="font-semibold text-[var(--foreground)]">Payment</span> and
          enter Merchant number{" "}
          <span className="font-semibold text-[var(--foreground)]">{BKASH_NUMBER}</span>
        </p>

        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-black/5 px-3 py-2 text-left dark:bg-white/5">
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Reference — please include</p>
          <p className="text-sm font-medium">{paymentReference(employee)}</p>
        </div>
      </div>
    </div>
  );
}
