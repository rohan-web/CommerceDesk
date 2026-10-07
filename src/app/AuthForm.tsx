"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {ArrowRight,Check,LockKeyhole,ShieldCheck} from "lucide-react";
function Mark(){return <span className="mark"><i/><i/><i/><i/></span>}
export default function AuthForm({mode}:{mode:"setup"|"login"}){
 const router=useRouter(),firstRun=mode==="setup";
 const[businessName,setBusinessName]=useState(""),[ownerName,setOwnerName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[token,setToken]=useState(""),[deploymentMode,setDeploymentMode]=useState(""),[commerceMode,setCommerceMode]=useState(""),[baseCurrency,setBaseCurrency]=useState(""),[timezone,setTimezone]=useState("");
 const[error,setError]=useState(""),[pending,setPending]=useState(false),[mfaRequired,setMfaRequired]=useState(false),[mfaCode,setMfaCode]=useState("");
 const[workspaceChoices,setWorkspaceChoices]=useState<{id:string;name:string}[]>([]),[tenantId,setTenantId]=useState("");
 async function submit(e:FormEvent){e.preventDefault();setError("");setPending(true);
  const body=firstRun?{setupToken:token,businessName,ownerName,email,password,deploymentMode,commerceMode,baseCurrency,timezone}:{email,password,...(tenantId?{tenantId}:{}),...(mfaCode?{mfaCode}:{})};
  try{const response=await fetch(firstRun?"/api/setup":"/api/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const result=await response.json().catch(()=>({}));if(result.mfaRequired)setMfaRequired(true);if(result.chooseWorkspace){setWorkspaceChoices(result.chooseWorkspace);setTenantId("");return}if(result.mfaRequired){setError("");return}if(!response.ok){setError(result.error||"Could not complete this request. Review the fields and try again.");return}router.replace("/");router.refresh()}
  catch{setError("CommerceDesk could not reach the setup service. Check your local services and try again.")}
  finally{setPending(false)}
 }
 return <main className="auth-shell"><div className="auth-glow"/><div className="auth-brand"><Mark/><b>commerce<span>desk</span></b><span className="auth-version">FIRST RELEASE</span></div><section className="auth-card"><div className="auth-mark"><Mark/></div><div className="auth-kicker"><i/>{firstRun?"SECURE FIRST-RUN SETUP":"PRIVATE BUSINESS WORKSPACE"}</div><h1>{firstRun?"Start your workspace.":"Welcome back."}</h1><p>{firstRun?"Create the business workspace and its first owner. Setup closes automatically after this one-time step.":"Sign in to your CommerceDesk account to continue."}</p>
  <form onSubmit={submit}>
   {firstRun?<>
    <div className="auth-fields two"><div><label htmlFor="biz-name">Business name</label><input id="biz-name" value={businessName} onChange={e=>setBusinessName(e.target.value)} autoComplete="organization" required minLength={2} maxLength={120} placeholder="Northstar Supply"/></div><div><label htmlFor="owner-name">Owner name</label><input id="owner-name" value={ownerName} onChange={e=>setOwnerName(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} placeholder="Your name"/></div></div>
    <div className="auth-fields two"><div><label htmlFor="deploy-mode">Deployment mode</label><select id="deploy-mode" value={deploymentMode} onChange={e=>setDeploymentMode(e.target.value)} required><option value="" disabled>Choose a mode</option><option value="standalone">Standalone business</option><option value="platform">Platform / agency</option></select></div><div><label htmlFor="commerce-mode">Commerce mode</label><select id="commerce-mode" value={commerceMode} onChange={e=>setCommerceMode(e.target.value)} required><option value="" disabled>Choose a mode</option><option value="native">Native CommerceDesk store</option><option value="woocommerce">Existing WooCommerce store</option></select></div></div>
    <div className="auth-fields two"><div><label htmlFor="base-currency">Base currency Â· ISO 4217</label><input id="base-currency" value={baseCurrency} onChange={e=>setBaseCurrency(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" pattern="[A-Za-z]{3}" minLength={3} maxLength={3} required placeholder="USD"/></div><div><label htmlFor="timezone">Business time zone</label><input id="timezone" value={timezone} onChange={e=>setTimezone(e.target.value)} autoComplete="off" required placeholder="Asia/Karachi"/></div></div>
    <div className="auth-fields"><div><label htmlFor="setup-token">One-time setup token</label><input id="setup-token" type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" required minLength={32} maxLength={512} placeholder="From the server environment"/><small>Use the SETUP_TOKEN configured on your server.</small></div></div>
   </>:null}
   {!firstRun&&workspaceChoices.length>0&&<div className="auth-fields"><div><label htmlFor="tenant-choice">Workspace</label><select id="tenant-choice" required value={tenantId} onChange={e=>setTenantId(e.target.value)}><option value="" disabled>Choose a workspace</option>{workspaceChoices.map(workspace=><option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div></div>}
   <div className="auth-fields"><div><label htmlFor="email">Email address</label><input id="email" type="email" value={email} onChange={e=>{setEmail(e.target.value);setWorkspaceChoices([]);setTenantId("");setMfaRequired(false);setMfaCode("")}} autoComplete="email" required maxLength={254} placeholder="you@business.com"/></div></div>
   <div className="auth-fields"><div><label htmlFor="password">{firstRun?"Create a password":"Password"}</label><input id="password" type="password" value={password} onChange={e=>{setPassword(e.target.value);setWorkspaceChoices([]);setTenantId("");setMfaRequired(false);setMfaCode("")}} autoComplete={firstRun?"new-password":"current-password"} required minLength={firstRun?12:1} maxLength={128} placeholder={firstRun?"At least 12 characters":"Your account password"}/>{firstRun&&<small>Use at least 12 characters.</small>}</div></div>
   {!firstRun&&mfaRequired&&<div className="auth-fields"><div><label htmlFor="mfa-code">Authenticator or recovery code</label><input id="mfa-code" inputMode="text" autoComplete="one-time-code" value={mfaCode} onChange={e=>setMfaCode(e.target.value)} required maxLength={64} placeholder="6-digit code or recovery code"/><small>Authenticator codes can only be used once per time window. Recovery codes are single-use.</small></div></div>}
   {error&&<div className="auth-error" role="alert"><span>!</span>{error}</div>}
   <button className="auth-submit" type="submit" disabled={pending}>{pending?(firstRun?"Creating workspaceâ€¦":"Signing inâ€¦"):(firstRun?"Create secure workspace":workspaceChoices.length?"Continue to workspace":"Sign in")}<ArrowRight/></button>
  </form>
  {!firstRun&&<div className="auth-local-note"><a href="/forgot-password">Forgot your password?</a></div>}
  <div className="auth-assurance"><ShieldCheck/><span>{firstRun?"Password is stored as a one-way scrypt hash. Your first owner membership is scoped to this tenant.":"Protected by revocable, HTTP-only sessions and server-side tenant membership."}</span></div>
  {firstRun&&<div className="auth-local-note"><LockKeyhole/>No customer records or demo metrics are created during setup.</div>}
 </section><footer className="auth-footer"><span>COMMERCE DESK <i/> FOUNDATION</span><span><Check/>Tenant-aware access</span></footer></main>
}


