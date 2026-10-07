import type {Metadata} from "next";
import PublicConversation from "../PublicConversation";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Private conversation · CommerceDesk",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function ConversationPage({params}:{params:Promise<{token:string}>}){const{token}=await params;return <PublicConversation token={token}/>}
