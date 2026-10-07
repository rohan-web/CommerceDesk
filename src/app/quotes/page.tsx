import {redirect} from "next/navigation";
import Dashboard from "../Dashboard";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
export const dynamic="force-dynamic";
export default async function QuotesPage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("quotes:write");return <Dashboard tenantName={access.tenant.name} userName={identity.name} role={access.scope.role} screen="quotes" canCreateQuotes={access.tenant.commerceMode==="native"} canConvertQuotes={access.scope.role==="owner"||access.scope.permissions.includes("quotes:approve")} canApproveQuotes={access.scope.role==="owner"||access.scope.permissions.includes("quotes:approve")} canConfigureQuoteApproval={access.scope.role==="owner"} currency={access.tenant.baseCurrency}/>}
