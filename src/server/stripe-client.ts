export type StripeAccountCheck={accountId:string;chargesEnabled:boolean;detailsSubmitted:boolean;livemode:boolean};
export class StripeApiError extends Error{readonly status:number;constructor(message:string,status:number){super(message);this.status=status;this.name="StripeApiError"}}
export async function verifyStripeAccountKey(apiKey:string,fetcher:typeof fetch=fetch):Promise<StripeAccountCheck>{
 if(!/^sk_(test|live)_[A-Za-z0-9]{12,}$/.test(apiKey))throw new StripeApiError("Enter a valid Stripe secret key.",400);
 let response:Response;
 try{response=await fetcher("https://api.stripe.com/v1/account",{method:"GET",headers:{Authorization:`Bearer ${apiKey}`,"Stripe-Version":"2025-06-30.basil"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)})}
 catch{throw new StripeApiError("Stripe could not be reached. Check the key and network, then try again.",503)}
 const body=await response.json().catch(()=>null) as unknown;
 if(!response.ok)throw new StripeApiError(response.status===401?"Stripe rejected this secret key.":"Stripe account verification is temporarily unavailable.",response.status===401?400:503);
 if(!body||typeof body!=="object")throw new StripeApiError("Stripe returned an unexpected account response.",502);
 const value=body as Record<string,unknown>;
 if(typeof value.id!=="string"||!/^acct_[A-Za-z0-9]+$/.test(value.id)||typeof value.charges_enabled!=="boolean"||typeof value.details_submitted!=="boolean"||typeof value.livemode!=="boolean")throw new StripeApiError("Stripe returned an incomplete account response.",502);
 if(value.livemode!==apiKey.startsWith("sk_live_"))throw new StripeApiError("The Stripe key mode did not match the account response.",400);
 return {accountId:value.id,chargesEnabled:value.charges_enabled,detailsSubmitted:value.details_submitted,livemode:value.livemode};
}

export type CheckoutSessionInput={apiKey:string;idempotencyKey:string;amountMinor:number;currency:string;productName:string;customerEmail?:string|null;successUrl:string;cancelUrl:string;expiresAtSeconds:number;metadata:Record<string,string>};
export type CheckoutSession={id:string;url:string;expiresAtSeconds:number};
export async function createStripeCheckoutSession(input:CheckoutSessionInput,fetcher:typeof fetch=fetch):Promise<CheckoutSession>{
 if(!/^sk_(test|live)_[A-Za-z0-9]{12,}$/.test(input.apiKey))throw new StripeApiError("The saved Stripe key is invalid. Reconnect the account.",503);
 if(!/^[A-Za-z0-9_-]{8,120}$/.test(input.idempotencyKey)||!Number.isSafeInteger(input.amountMinor)||input.amountMinor<1||input.amountMinor>Number.MAX_SAFE_INTEGER||!/^[A-Z]{3}$/.test(input.currency)||input.productName.length>160)throw new StripeApiError("Payment details are invalid.",400);
 const form=new URLSearchParams();form.set("mode","payment");form.set("success_url",input.successUrl);form.set("cancel_url",input.cancelUrl);form.set("expires_at",String(input.expiresAtSeconds));form.set("line_items[0][price_data][currency]",input.currency.toLowerCase());form.set("line_items[0][price_data][unit_amount]",String(input.amountMinor));form.set("line_items[0][price_data][product_data][name]",input.productName);form.set("line_items[0][quantity]","1");
 if(input.customerEmail)form.set("customer_email",input.customerEmail);
 for(const[key,value]of Object.entries(input.metadata)){if(!/^[a-z_]{1,40}$/.test(key)||value.length>500)throw new StripeApiError("Payment metadata is invalid.",400);form.set(`metadata[${key}]`,value);form.set(`payment_intent_data[metadata][${key}]`,value)}
 let response:Response;
 try{response=await fetcher("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:`Bearer ${input.apiKey}`,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":input.idempotencyKey,"Stripe-Version":"2025-06-30.basil"},body:form.toString(),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)})}
 catch{throw new StripeApiError("Stripe could not be reached. The checkout can be retried safely.",503)}
 const body=await response.json().catch(()=>null) as unknown;
 if(!response.ok)throw new StripeApiError(response.status===401?"Stripe rejected the saved key. Reconnect the account.":"Stripe could not create the payment session. Try again.",response.status===400?400:503);
 if(!body||typeof body!=="object")throw new StripeApiError("Stripe returned an unexpected checkout response.",502);
 const value=body as Record<string,unknown>;
 if(typeof value.id!=="string"||!/^cs_(test|live)_[A-Za-z0-9]+$/.test(value.id)||typeof value.url!=="string"||!/^https:\/\/checkout\.stripe\.com\//.test(value.url)||typeof value.expires_at!=="number"||!Number.isSafeInteger(value.expires_at))throw new StripeApiError("Stripe returned an incomplete checkout session.",502);
 return{id:value.id,url:value.url,expiresAtSeconds:value.expires_at};
}

export type StripeRefundInput={apiKey:string;idempotencyKey:string;paymentIntentId:string;amountMinor:number;currency:string;metadata:Record<string,string>};
export type StripeRefund={id:string;status:"pending"|"succeeded"|"failed"|"canceled";amountMinor:number;currency:string;paymentIntentId:string};
export async function createStripeRefund(input:StripeRefundInput,fetcher:typeof fetch=fetch):Promise<StripeRefund>{
 if(!/^sk_(test|live)_[A-Za-z0-9]{12,}$/.test(input.apiKey))throw new StripeApiError("The saved Stripe key is invalid. Reconnect the account.",503);
 if(!/^[A-Za-z0-9_-]{8,120}$/.test(input.idempotencyKey)||!/^pi_[A-Za-z0-9]+$/.test(input.paymentIntentId)||!Number.isSafeInteger(input.amountMinor)||input.amountMinor<1||! /^[A-Z]{3}$/.test(input.currency))throw new StripeApiError("Refund details are invalid.",400);
 const form=new URLSearchParams();form.set("payment_intent",input.paymentIntentId);form.set("amount",String(input.amountMinor));
 for(const[key,value]of Object.entries(input.metadata)){if(!/^[a-z_]{1,40}$/.test(key)||value.length>500)throw new StripeApiError("Refund metadata is invalid.",400);form.set(`metadata[${key}]`,value)}
 let response:Response;
 try{response=await fetcher("https://api.stripe.com/v1/refunds",{method:"POST",headers:{Authorization:`Bearer ${input.apiKey}`,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":input.idempotencyKey,"Stripe-Version":"2025-06-30.basil"},body:form.toString(),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)})}
 catch{throw new StripeApiError("Stripe could not be reached. The refund can be retried safely.",503)}
 const body=await response.json().catch(()=>null) as unknown;
 if(!response.ok)throw new StripeApiError(response.status===401?"Stripe rejected the saved key. Reconnect the account.":"Stripe could not create the refund. Review the payment and try again.",response.status===400?400:503);
 if(!body||typeof body!=="object")throw new StripeApiError("Stripe returned an unexpected refund response.",502);
 const value=body as Record<string,unknown>,status=value.status;
 if(typeof value.id!=="string"||!/^re_[A-Za-z0-9]+$/.test(value.id)||!(["pending","succeeded","failed","canceled"] as unknown[]).includes(status)||value.amount!==input.amountMinor||typeof value.currency!=="string"||value.currency.toUpperCase()!==input.currency||value.payment_intent!==input.paymentIntentId)throw new StripeApiError("Stripe returned an incomplete refund response.",502);
 return{id:value.id,status:status as StripeRefund["status"],amountMinor:value.amount as number,currency:value.currency.toUpperCase(),paymentIntentId:value.payment_intent as string};
}
