import { Suspense } from "react";
import LoginForm from "@/components/ledger/LoginForm";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  return (
    <div className="relative grid min-h-screen flex-1 lg:grid-cols-[1.1fr_1fr]">
      <aside className="bh-hero relative hidden !rounded-none lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl backdrop-blur">☕</div>
          <div>
            <p className="text-lg font-semibold tracking-tight">BrewHood Coffee</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">Manager Dashboard</p>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Great coffee,<br />honest tabs.</h2>
          <p className="mt-4 text-base text-amber-50/75">
            Sales, collections, dues and payroll for the whole team — one calm place to keep every cup accounted for.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Live balances", "bKash & bank tracking", "Team access control"].map((t) => (
              <span key={t} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-amber-50/90 backdrop-blur-sm">
                {t}
              </span>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-amber-50/50">© BrewHood Coffee</p>
      </aside>
      <div className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
