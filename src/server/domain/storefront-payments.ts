export type StorefrontPaymentMode="full"|"deposit";

export function initialStorefrontPaymentMinor(totalMinor:number,mode:StorefrontPaymentMode,depositPercentBps:number):number{
 if(!Number.isSafeInteger(totalMinor)||totalMinor<0||!Number.isSafeInteger(depositPercentBps)||depositPercentBps<1||depositPercentBps>9999)throw new RangeError("Storefront payment values are invalid.");
 if(totalMinor===0)return 0;
 if(mode==="full")return totalMinor;
 return Math.max(1,Number((BigInt(totalMinor)*BigInt(depositPercentBps)+9999n)/10000n));
}

export function nextStorefrontPaymentMinor(totalMinor:number,capturedMinor:number,refundedMinor:number,initialPaymentMinor:number):number{
 if(![totalMinor,capturedMinor,refundedMinor,initialPaymentMinor].every(Number.isSafeInteger)||totalMinor<0||capturedMinor<0||refundedMinor<0||refundedMinor>capturedMinor||initialPaymentMinor<0||initialPaymentMinor>totalMinor)throw new RangeError("Storefront ledger totals are invalid.");
 const outstanding=totalMinor-capturedMinor+refundedMinor;if(outstanding<=0)return 0;
 const netPaid=capturedMinor-refundedMinor;
 return Math.min(outstanding,netPaid<initialPaymentMinor?initialPaymentMinor-netPaid:outstanding);
}
