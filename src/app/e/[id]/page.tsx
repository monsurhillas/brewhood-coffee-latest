import type { Metadata } from "next";
import EmployeeSharePage from "@/components/ledger/EmployeeSharePage";

export const metadata: Metadata = {
  title: "My Ledger — BrewHood Coffee",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeSharePage employeeId={id} />;
}
