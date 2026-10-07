import {redirect} from "next/navigation";
import {readSession} from "@/server/auth";
import {requirePageTenantAccess} from "@/server/page-access";
import PackingSlip from "./PackingSlip";
export const dynamic="force-dynamic";
export default async function PackingSlipPage({params}:{params:Promise<{id:string}>}){const identity=await readSession();if(!identity)redirect("/login");await requirePageTenantAccess("orders:fulfil");const {id}=await params;return <PackingSlip orderId={id}/>}
