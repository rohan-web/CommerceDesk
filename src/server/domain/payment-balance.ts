export function remainingRefundableMinor(capturedMinor:number,refundedMinor:number,pendingRefundMinor=0){
 if(![capturedMinor,refundedMinor,pendingRefundMinor].every(Number.isSafeInteger)||capturedMinor<0||refundedMinor<0||pendingRefundMinor<0)throw new RangeError("Payment balances must be non-negative safe integers.");
 const remaining=capturedMinor-refundedMinor-pendingRefundMinor;
 if(remaining<0)throw new RangeError("Refunds and pending refunds exceed captured funds.");
 return remaining;
}
export function paymentStatusFromLedger(capturedMinor:number,refundedMinor:number,orderTotalMinor:number){
 if(![capturedMinor,refundedMinor,orderTotalMinor].every(Number.isSafeInteger)||capturedMinor<0||refundedMinor<0||orderTotalMinor<0||refundedMinor>capturedMinor)throw new RangeError("Ledger totals must be valid and refunds cannot exceed captures.");
 if(refundedMinor===capturedMinor&&refundedMinor>0)return"refunded";
 if(refundedMinor>0)return"partially_refunded";
 if(capturedMinor>=orderTotalMinor)return"paid";
 if(capturedMinor>0)return"partially_paid";
 return"unpaid";
}
