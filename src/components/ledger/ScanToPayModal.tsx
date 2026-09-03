"use client";

import { formatMoney } from "@/lib/format";

export const BKASH_NUMBER = "01744337974";

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
export default function ScanToPayModal({
  employee,
  onClose,
}: {
  employee: PayableEmployee;
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
              Amount due <span className="font-semibold text-red-500">{formatMoney(due)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Close
          </button>
        </div>

        <img
          src="/bkash-qr.png"
          alt="bKash QR code — scan to pay BrewHood Coffee"
          className="mx-auto w-full max-w-[240px] rounded-xl border border-[var(--border)]"
        />

        <p className="mt-3 text-xs text-[var(--muted)]">
          Scan with the bKash app, or Send Money to{" "}
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
