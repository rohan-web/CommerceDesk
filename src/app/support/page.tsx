import {redirect} from "next/navigation";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
import SupportDesk from "./SupportDesk";
import "./support.css";
export const dynamic="force-dynamic";
export default async function SupportPage(){const identity=await readSession();if(!identity)redirect("/login");const access=await requirePageTenantAccess("support:write");return <SupportDesk tenantName={access.tenant.name} userName={identity.name}/>}
