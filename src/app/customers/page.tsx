import {redirect} from "next/navigation";
import Dashboard from "../Dashboard";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
export const dynamic="force-dynamic";
export default async function CustomersPage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("customers:read");return <Dashboard tenantName={access.tenant.name} userName={identity.name} role={access.scope.role} screen="customers" canManageCustomers={["owner","sales"].includes(access.scope.role)}/>}



