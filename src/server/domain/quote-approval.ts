export function quoteDiscountRequiresApproval(discountPercentBps:number,thresholdBps:number){
 if(!Number.isInteger(discountPercentBps)||!Number.isInteger(thresholdBps)||discountPercentBps<0||thresholdBps<0||discountPercentBps>9999||thresholdBps>9999)throw new RangeError("Quote discount and approval threshold must be basis points from 0 to 9999.");
 return discountPercentBps>thresholdBps;
}
