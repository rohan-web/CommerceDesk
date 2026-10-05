import {redirect} from "next/navigation";
import Dashboard from "../../Dashboard";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
import {can} from "@/server/permissions";
export const dynamic="force-dynamic";
export default async function StoreSettingsPage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("tenant:settings");return <Dashboard tenantName={access.tenant.name} userName={identity.name} role={access.scope.role} screen="storeSettings" canManageStore={can(access.scope,"tenant:settings")} currency={access.tenant.baseCurrency}/>}
