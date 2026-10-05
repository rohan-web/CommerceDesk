import type {Metadata} from "next";
import PublicCustomerPortal from "@/app/PublicCustomerPortal";
import "@/app/public-customer-portal.css";
export const metadata:Metadata={title:"Customer portal | CommerceDesk",robots:{index:false,follow:false},referrer:"no-referrer"};
export const dynamic="force-dynamic";
export default async function CustomerPortalPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PublicCustomerPortal token={token}/>}
