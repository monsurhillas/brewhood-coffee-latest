import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default async function DashboardPage() {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }

  return <DashboardShell managerName={session.user?.name ?? "Manager"} />;
}
