import { Suspense } from "react";
import LoginForm from "@/components/ledger/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[var(--background)] px-6 py-12">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
