import {redirect} from "next/navigation";
import Dashboard from "./Dashboard";
import {readSession} from "@/server/auth";
import {connectDatabase} from "@/server/db";
import {SetupState} from "@/server/models/SetupState";
function ServiceNotice(){return <main className="auth-shell"><div className="auth-brand"><span className="mark"><i/><i/><i/><i/></span><b>commerce<span>desk</span></b></div><section className="auth-card"><div className="auth-kicker">WORKSPACE SERVICES</div><h1>Connect your local services.</h1><p>CommerceDesk needs MongoDB before first-run setup or sign-in. Start the local stack and check the environment values in the setup guide.</p><div className="service-note">Open the CommerceDesk README from the project folder for setup steps.</div></section></main>}
export const dynamic="force-dynamic";
export default async function Home(){
 let session:null|Awaited<ReturnType<typeof readSession>>=null,complete=false;
 try{session=await readSession();if(!session){await connectDatabase();complete=Boolean(await SetupState.exists({_id:"installation"}))}}catch{return <ServiceNotice/>}
 if(session)return <Dashboard tenantName={session.tenantName} userName={session.name} role={session.role}/>;
 redirect(complete?"/login":"/setup");
}

