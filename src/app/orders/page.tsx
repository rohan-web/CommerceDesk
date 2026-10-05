import {redirect} from "next/navigation";
import Dashboard from "../Dashboard";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
import {can} from "@/server/permissions";
export const dynamic="force-dynamic";
export default async function OrdersPage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("orders:read");return <Dashboard tenantName={access.tenant.name} userName={identity.name} role={access.scope.role} screen="orders" canReadPayments={can(access.scope,"payments:read")} canCapturePayments={can(access.scope,"payments:verify")} canRefundPayments={can(access.scope,"refunds:approve")} canCreateOrders={["owner","sales","operations"].includes(access.scope.role) && access.tenant.commerceMode === "native"} currency={access.tenant.baseCurrency}/>}




