import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {formatMinorUnits} from "@/server/domain/money";
import {loadPublicOrderReceipt} from "@/server/public-orders";
import {Check,Clock3,LockKeyhole,Mail,PackageCheck,Store,Truck} from "lucide-react";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Order receipt · CommerceDesk",robots:{index:false,follow:false},referrer:"no-referrer"};
function Mark(){return <span className="storefront-mark"><i/><i/><i/><i/></span>}
export default async function PublicOrderReceipt({params}:{params:Promise<{token:string}>}){
 const{token}=await params;let receipt;
 try{receipt=await loadPublicOrderReceipt(token)}catch{return <main className="receipt-shell"><h1>Receipt temporarily unavailable</h1><p>Please reload this page in a moment.</p></main>}
 if(!receipt)notFound();
 const{order,store}=receipt,canceled=order.status==="cancelled",cash=order.paymentMethod==="cash_on_pickup",address=order.shippingAddress;
 const headline=canceled?"This order is no longer active.":"Your order is reserved.";
 const message=canceled?(order.cancelReason==="hold_expired"?"The payment window expired and reserved stock was released.":"The store cancelled this order. Contact them if you need help."):cash?"Bring your order number when you collect it. The business will record payment after receiving cash.":"Use the payment instructions below. The order stays pending until the business verifies receipt.";
 return <main className="receipt-shell">
  <header className="receipt-brand"><a href={`/store/${store.slug}`}><Mark/><span><b>{store.name}</b><small>ORDER RECEIPT</small></span></a><span className="receipt-secure"><LockKeyhole/>PRIVATE RECEIPT LINK</span></header>
  <section className="receipt-card">
   <div className={`receipt-status ${canceled?"cancelled":""}`}><span>{canceled?<Clock3/>:<Check/>}</span><small>{canceled?"RESERVATION CLOSED":"ORDER RECEIVED"}</small><h1>{headline}</h1><p>{message}</p></div>
   <div className="receipt-number"><small>ORDER NUMBER</small><b>{order.orderNumber}</b><span>{new Date(order.createdAt).toLocaleString()}</span></div>
   <div className="receipt-lines">{order.lines.map((line,index)=><article key={`${line.name}-${index}`}><div><b>{line.name}</b>{line.sku&&<small>{line.sku}</small>}<small>Quantity {line.quantity}</small></div><strong>{formatMinorUnits(line.grossMinor,order.currency,"en")}</strong></article>)}</div>
   <div className="receipt-totals"><span>Items subtotal <b>{formatMinorUnits(order.subtotalMinor,order.currency,"en")}</b></span>{order.shippingFeeMinor>0&&<span>Delivery <b>{formatMinorUnits(order.shippingFeeMinor,order.currency,"en")}</b></span>}<span>Tax <b>{formatMinorUnits(order.taxMinor,order.currency,"en")}</b></span><strong>Order total <b>{formatMinorUnits(order.totalMinor,order.currency,"en")}</b></strong></div>
   <div className="receipt-meta">
    <div><span>{order.fulfilmentMethod==="delivery"?<Truck/>:<Store/>}FULFILLMENT</span><b>{order.fulfilmentMethod==="delivery"?"Delivery":"Pickup"} · {order.fulfilmentStatus}</b>{address&&<small>{address.recipient}<br/>{address.line1}{address.line2?`, ${address.line2}`:""}<br/>{address.city}{address.region?`, ${address.region}`:""} {address.postalCode}<br/>{address.countryCode}</small>}</div>
    <div><span><PackageCheck/>PAYMENT STATUS</span><b>{order.paymentStatus.replaceAll("_"," ")}</b><small>{cash?"Cash at pickup":"Manual bank transfer"}</small></div>
   </div>
   {!canceled&&order.paymentMethod==="bank_transfer"&&<section className="receipt-payment-instructions"><small>PAYMENT INSTRUCTIONS</small><p>{order.paymentInstructions}</p>{order.reservationExpiresAt&&<span><Clock3/> Stock hold ends {new Date(order.reservationExpiresAt).toLocaleString()}.</span>}</section>}
   {!canceled&&cash&&order.reservationExpiresAt&&<div className="receipt-hold-note"><Clock3/> Stock is held until {new Date(order.reservationExpiresAt).toLocaleString()}.</div>}
   <div className="receipt-save-note"><LockKeyhole/><span>Save this private link to revisit your receipt. Anyone with the link can view this order.</span></div>
   {store.contactEmail&&<a className="receipt-contact" href={`mailto:${store.contactEmail}?subject=${encodeURIComponent(`Order ${order.orderNumber}`)}`}><Mail/>Contact {store.name}<span>{store.contactEmail}</span></a>}
   <a className="receipt-back" href={`/store/${store.slug}`}>Continue browsing <span>↗</span></a>
  </section>
  <footer className="receipt-footer">COMMERCE DESK <span>Secure order record · {order.orderNumber}</span></footer>
 </main>;
}
