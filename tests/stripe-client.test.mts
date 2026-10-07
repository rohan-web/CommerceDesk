import test from "node:test";
import assert from "node:assert/strict";
import {verifyStripeAccountKey,createStripeCheckoutSession,createStripeRefund,StripeApiError} from "../src/server/stripe-client.ts";
test("Stripe account verification sends the key securely and returns only safe account state",async()=>{
 let observedRequest:RequestInit|undefined;
 const fetcher=async(_url:URL|string,init?:RequestInit)=>{observedRequest=init;return Response.json({id:"acct_example123",charges_enabled:true,details_submitted:true,livemode:false})};
 const account=await verifyStripeAccountKey("sk_test_abcdefghijklmnop",fetcher as typeof fetch);
 assert.deepEqual(account,{accountId:"acct_example123",chargesEnabled:true,detailsSubmitted:true,livemode:false});
 assert.equal(observedRequest?.redirect,"error");assert.equal((observedRequest?.headers as Record<string,string>).Authorization,"Bearer sk_test_abcdefghijklmnop");
});
test("Stripe account verification rejects invalid keys and mismatched key modes",async()=>{
 await assert.rejects(()=>verifyStripeAccountKey("pk_test_public",async()=>Response.json({}) as Response),(error:unknown)=>error instanceof StripeApiError&&error.status===400);
 await assert.rejects(()=>verifyStripeAccountKey("sk_live_abcdefghijklmnop",async()=>Response.json({id:"acct_example123",charges_enabled:true,details_submitted:true,livemode:false}) as Response),(error:unknown)=>error instanceof StripeApiError&&error.status===400);
});
test("Stripe verification reports invalid credentials and provider/network failures safely",async()=>{
 await assert.rejects(()=>verifyStripeAccountKey("sk_test_abcdefghijklmnop",async()=>new Response(null,{status:401})),/Stripe rejected this secret key/);
 await assert.rejects(()=>verifyStripeAccountKey("sk_test_abcdefghijklmnop",async()=>{throw new Error("internal network details")}),/Check the key and network/);
});
test("Stripe Checkout uses server-supplied totals, metadata, redirect validation, and a stable idempotency key",async()=>{
 let sentUrl="",sentInit:RequestInit|undefined;
 const fetcher=async(url:URL|string,init?:RequestInit)=>{sentUrl=String(url);sentInit=init;return Response.json({id:"cs_test_session123",url:"https://checkout.stripe.com/c/pay/cs_test_session123",expires_at:1_800_000_000})};
 const result=await createStripeCheckoutSession({apiKey:"sk_test_abcdefghijklmnop",idempotencyKey:"checkout_attempt_123456",amountMinor:12500,currency:"USD",productName:"Order ORD-26-000001",customerEmail:"buyer@example.com",successUrl:"https://shop.example/order/token?paid=1",cancelUrl:"https://shop.example/order/token?cancelled=1",expiresAtSeconds:1_800_000_000,metadata:{tenant_id:"0123456789abcdef01234567",order_id:"abcdef0123456789abcdef01"}},fetcher as typeof fetch);
 assert.equal(sentUrl,"https://api.stripe.com/v1/checkout/sessions");
 const headers=sentInit?.headers as Record<string,string>;
 assert.equal(headers.Authorization,"Bearer sk_test_abcdefghijklmnop");assert.equal(headers["Idempotency-Key"],"checkout_attempt_123456");assert.equal(sentInit?.redirect,"error");
 const form=new URLSearchParams(String(sentInit?.body));assert.equal(form.get("line_items[0][price_data][unit_amount]"),"12500");assert.equal(form.get("line_items[0][price_data][currency]"),"usd");assert.equal(form.get("metadata[tenant_id]"),"0123456789abcdef01234567");assert.equal(form.get("payment_intent_data[metadata][order_id]"),"abcdef0123456789abcdef01");assert.equal(result.id,"cs_test_session123");assert.match(result.url,/^https:\/\/checkout\.stripe\.com\//);
});
test("Stripe Checkout rejects unsafe inputs, provider errors, and non-Stripe redirect URLs",async()=>{
 let called=false;const noCall=async()=>{called=true;return Response.json({})};
 await assert.rejects(()=>createStripeCheckoutSession({apiKey:"pk_test_public",idempotencyKey:"checkout_attempt_123456",amountMinor:10,currency:"USD",productName:"Order",successUrl:"https://shop.example/success",cancelUrl:"https://shop.example/cancel",expiresAtSeconds:1_800_000_000,metadata:{}},noCall as typeof fetch),/saved Stripe key is invalid/);assert.equal(called,false);
 const base={apiKey:"sk_test_abcdefghijklmnop",idempotencyKey:"checkout_attempt_123456",amountMinor:10,currency:"USD",productName:"Order",successUrl:"https://shop.example/success",cancelUrl:"https://shop.example/cancel",expiresAtSeconds:1_800_000_000,metadata:{}};
 await assert.rejects(()=>createStripeCheckoutSession({...base,amountMinor:0},noCall as typeof fetch),/Payment details are invalid/);
 await assert.rejects(()=>createStripeCheckoutSession(base,async()=>Response.json({error:{message:"secret internal detail"}},{status:500}) as Response),/Stripe could not create the payment session/);
 await assert.rejects(()=>createStripeCheckoutSession(base,async()=>Response.json({id:"cs_test_session123",url:"https://evil.example/pay",expires_at:1_800_000_000}) as Response),/incomplete checkout session/);
});
test("Stripe refunds use an idempotent provider request and validate the returned payment",async()=>{
 let sentUrl="",sentInit:RequestInit|undefined;
 const fetcher=async(url:URL|string,init?:RequestInit)=>{sentUrl=String(url);sentInit=init;return Response.json({id:"re_refund123",status:"succeeded",amount:2500,currency:"usd",payment_intent:"pi_payment123"})};
 const refund=await createStripeRefund({apiKey:"sk_test_abcdefghijklmnop",idempotencyKey:"stripe_refund_0123456789abcdef",paymentIntentId:"pi_payment123",amountMinor:2500,currency:"USD",metadata:{tenant_id:"0123456789abcdef01234567",order_id:"abcdef0123456789abcdef01"}},fetcher as typeof fetch);
 assert.equal(sentUrl,"https://api.stripe.com/v1/refunds");const headers=sentInit?.headers as Record<string,string>;assert.equal(headers.Authorization,"Bearer sk_test_abcdefghijklmnop");assert.equal(headers["Idempotency-Key"],"stripe_refund_0123456789abcdef");assert.equal(sentInit?.redirect,"error");
 const form=new URLSearchParams(String(sentInit?.body));assert.equal(form.get("payment_intent"),"pi_payment123");assert.equal(form.get("amount"),"2500");assert.equal(form.get("metadata[tenant_id]"),"0123456789abcdef01234567");assert.deepEqual(refund,{id:"re_refund123",status:"succeeded",amountMinor:2500,currency:"USD",paymentIntentId:"pi_payment123"});
});
test("Stripe refunds reject unsafe inputs and mismatched provider results",async()=>{
 let called=false;const noCall=async()=>{called=true;return Response.json({})};const base={apiKey:"sk_test_abcdefghijklmnop",idempotencyKey:"stripe_refund_0123456789abcdef",paymentIntentId:"pi_payment123",amountMinor:100,currency:"USD",metadata:{}};
 await assert.rejects(()=>createStripeRefund({...base,amountMinor:0},noCall as typeof fetch),/Refund details are invalid/);assert.equal(called,false);
 await assert.rejects(()=>createStripeRefund(base,async()=>Response.json({id:"re_refund123",status:"succeeded",amount:99,currency:"usd",payment_intent:"pi_payment123"}) as Response),/incomplete refund response/);
 await assert.rejects(()=>createStripeRefund(base,async()=>Response.json({error:{message:"private provider detail"}},{status:500}) as Response),/Stripe could not create the refund/);
});
