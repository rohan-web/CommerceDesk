import {redirect} from "next/navigation";
import Dashboard from "../Dashboard";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
export default async function TeamPage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("members:manage");return <Dashboard tenantName={access.tenant.name} userName={identity.name} role={access.scope.role} screen="team"/>}
