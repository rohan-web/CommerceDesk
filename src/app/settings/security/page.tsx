import { redirect } from "next/navigation";
import Dashboard from "../../Dashboard";
import { readSession } from "@/server/auth";

export const dynamic = "force-dynamic";
export default async function SecuritySettingsPage() {
  const identity = await readSession();
  if (!identity) redirect("/login");
  return <Dashboard tenantName={identity.tenantName} userName={identity.name} role={identity.role} screen="securitySettings"/>;
}
