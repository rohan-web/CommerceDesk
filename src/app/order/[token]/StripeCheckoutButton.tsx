"use client";
import {useState} from "react";
import {ArrowRight,CircleAlert,LoaderCircle,LockKeyhole} from "lucide-react";
import {formatMinorUnits} from "@/server/domain/money";
export default function StripeCheckoutButton({token,amountDue,currency,isDeposit}:{token:string;amountDue:number;currency:string;isDeposit:boolean}){
 const[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function pay(){setBusy(true);setError("");try{const response=await fetch(`/api/order/${encodeURIComponent(token)}/stripe-checkout`,{method:"POST",headers:{"content-type":"application/json"}}),data=await response.json();if(!response.ok)throw new Error(data.error||"Secure checkout could not be started.");if(typeof data.url!=="string"||!data.url.startsWith("https://checkout.stripe.com/"))throw new Error("Stripe returned an invalid checkout address.");window.location.assign(data.url)}catch(reason){setError(reason instanceof Error?reason.message:"Secure checkout could not be started.");setBusy(false)}}
 return <div className="receipt-stripe-pay"><button type="button" onClick={()=>void pay()} disabled={busy}>{busy?<LoaderCircle className="receipt-spinner"/>:<LockKeyhole/>}{busy?"Preparing secure checkout…":`${isDeposit?"Pay deposit":"Pay balance"} · ${formatMinorUnits(amountDue,currency,"en")}`}<ArrowRight/></button>{error&&<p role="alert"><CircleAlert/>{error}</p>}</div>
}
