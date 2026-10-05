import {redirect} from "next/navigation";
import AuthForm from "../AuthForm";
import {connectDatabase} from "@/server/db";
import {SetupState} from "@/server/models/SetupState";
function ServiceNotice(){return <main className="auth-shell"><div className="auth-brand"><span className="mark"><i/><i/><i/><i/></span><b>commerce<span>desk</span></b></div><section className="auth-card"><div className="auth-kicker">WORKSPACE SERVICES</div><h1>Connect your local services.</h1><p>CommerceDesk needs MongoDB before sign-in. Start the local stack and check the setup guide.</p></section></main>}
export const dynamic="force-dynamic";
export default async function LoginPage(){let installed=false;try{await connectDatabase();installed=Boolean(await SetupState.exists({_id:"installation"}))}catch{return <ServiceNotice/>}if(!installed)redirect("/setup");return <AuthForm mode="login"/>}
