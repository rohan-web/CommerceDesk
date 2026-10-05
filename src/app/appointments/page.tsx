import {redirect} from "next/navigation";
import Dashboard from "../Dashboard";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";

export default async function AppointmentsPage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("appointments:write");return <Dashboard tenantName={access.tenant.name} userName={identity.name} role={access.scope.role} screen="appointments"/>}
