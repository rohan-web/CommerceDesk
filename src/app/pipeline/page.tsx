import {redirect} from "next/navigation";
import Dashboard from "../Dashboard";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
export default async function PipelinePage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("deals:write");return <Dashboard tenantName={access.tenant.name} userName={identity.name} role={access.scope.role} screen="pipeline" currency={access.tenant.baseCurrency}/>}
