import PublicQuote from "../PublicQuote";
export const dynamic="force-dynamic";
export default async function SharedQuotePage({params}:{params:Promise<{token:string}>}){const{token}=await params;return <PublicQuote token={token}/>}
