"use client";

import { useRef, useState } from "react";

export default function AddEmployeeModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [mode, setMode] = useState<"single" | "csv">("single");

  // Single add
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // CSV bulk
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvResult, setCsvResult] = useState<{ created: number; updated: number; errors: string[] } | null>(
    null
  );
  const [importing, setImporting] = useState(false);

  async function handleSingleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !name) {
      setMessage("Employee ID and name are required.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employeeId, name, phone: phone || null, role: role || null }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage("Employee added.");
      setEmployeeId("");
      setName("");
      setPhone("");
      setRole("");
      onImported();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to add employee.");
    }
  }

  async function handleCsvUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("Choose a CSV file first.");
      return;
    }
    setImporting(true);
    setMessage(null);
    setCsvResult(null);
    const text = await file.text();
    const res = await fetch("/api/employees/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text }),
    });
    setImporting(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCsvResult(data);
      onImported();
    } else {
      setMessage(data.error ?? "Import failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[var(--card)] p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium">Add Employee</h3>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Close
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setMode("single")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              mode === "single" ? "bg-[var(--brand)] text-white" : "border border-[var(--border)]"
            }`}
          >
            Single
          </button>
          <button
            onClick={() => setMode("csv")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              mode === "csv" ? "bg-[var(--brand)] text-white" : "border border-[var(--border)]"
            }`}
          >
            CSV Bulk Upload
          </button>
        </div>

        {mode === "single" ? (
          <form onSubmit={handleSingleAdd} className="flex flex-col gap-3">
            <input
              placeholder="Employee ID"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
            <input
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
            <input
              placeholder="Role (optional)"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
            {message && <p className="text-sm text-[var(--brand)]">{message}</p>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Add Employee"}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--muted)]">
              CSV columns: <code>employee_id,name,phone,role</code> (header row required; phone and role are
              optional).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="text-sm"
            />
            {message && <p className="text-sm text-red-500">{message}</p>}
            <button
              onClick={handleCsvUpload}
              disabled={importing}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {importing ? "Importing…" : "Upload CSV"}
            </button>
            {csvResult && (
              <div className="rounded-lg border border-[var(--border)] p-3 text-xs">
                <p>
                  Created {csvResult.created}, updated {csvResult.updated}.
                </p>
                {csvResult.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-red-500">
                    {csvResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
