import { Suspense } from "react";
import LoginForm from "@/components/ledger/LoginForm";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center bg-[var(--background)] px-6 py-12">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
