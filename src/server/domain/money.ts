export type Currency = string;
export type TaxMode = "inclusive"|"exclusive";
export type LineAmountInput = {unitPriceMinor:number;quantity:number;taxRateBps:number;taxMode:TaxMode};
export type LineAmount = {currency:Currency;netMinor:number;taxMinor:number;grossMinor:number};
function integer(value:number,name:string){if(!Number.isSafeInteger(value))throw new RangeError(`${name} must be a safe integer.`)}
function toSafeNumber(value:bigint,name:string){const n=Number(value);if(!Number.isSafeInteger(n))throw new RangeError(`${name} exceeds safe integer range.`);return n}
/** Tax is rounded half up once at line level; amounts stay in integer minor units. */
export function calculateLineAmount(input:LineAmountInput,currency:Currency):LineAmount {
 integer(input.unitPriceMinor,"unitPriceMinor");integer(input.quantity,"quantity");integer(input.taxRateBps,"taxRateBps");
 if(input.unitPriceMinor<0||input.quantity<0||input.taxRateBps<0||input.taxRateBps>100000)throw new RangeError("Line amount inputs are out of range.");
 if(!/^[A-Z]{3}$/.test(currency))throw new RangeError("Currency must be a three-letter uppercase code.");
 const base=BigInt(input.unitPriceMinor)*BigInt(input.quantity);
 const rate=BigInt(input.taxRateBps);
 if(input.taxMode==="inclusive"){
  const tax=(base*rate+(10000n+rate)/2n)/(10000n+rate);
  return {currency,netMinor:toSafeNumber(base-tax,"netMinor"),taxMinor:toSafeNumber(tax,"taxMinor"),grossMinor:toSafeNumber(base,"grossMinor")};
 }
 const tax=(base*rate+5000n)/10000n;const gross=base+tax;
 return {currency,netMinor:toSafeNumber(base,"netMinor"),taxMinor:toSafeNumber(tax,"taxMinor"),grossMinor:toSafeNumber(gross,"grossMinor")};
}
export function formatMinorUnits(amountMinor:number,currency:Currency,locale:string){
 integer(amountMinor,"amountMinor");
 const formatter=new Intl.NumberFormat(locale,{style:"currency",currency});
 const digits=formatter.resolvedOptions().maximumFractionDigits ?? 2;
 return formatter.format(amountMinor/(10**digits));
}

/** Apply a basis-point discount with half-up rounding in integer minor units. */
export function applyDiscountMinor(amountMinor:number,discountPercentBps:number){
 integer(amountMinor,"amountMinor");integer(discountPercentBps,"discountPercentBps");
 if(amountMinor<0||discountPercentBps<0||discountPercentBps>9999)throw new RangeError("Discount inputs are out of range.");
 return toSafeNumber((BigInt(amountMinor)*BigInt(10000-discountPercentBps)+5000n)/10000n,"discounted amount");
}
/** Discounts the taxable base before recalculating tax once at the line level. */
export function calculateDiscountedLineAmount(input:LineAmountInput,currency:Currency,discountPercentBps:number):LineAmount&{discountAmountMinor:number}{
 const original=calculateLineAmount(input,currency);
 if(!Number.isInteger(discountPercentBps)||discountPercentBps<0||discountPercentBps>9999)throw new RangeError("Discount inputs are out of range.");
 const rate=BigInt(input.taxRateBps);let netMinor:number,taxMinor:number,grossMinor:number;
 if(input.taxMode==="inclusive"){
  grossMinor=applyDiscountMinor(original.grossMinor,discountPercentBps);const tax=(BigInt(grossMinor)*rate+(10000n+rate)/2n)/(10000n+rate);taxMinor=toSafeNumber(tax,"taxMinor");netMinor=grossMinor-taxMinor;
 }else{
  netMinor=applyDiscountMinor(original.netMinor,discountPercentBps);const tax=(BigInt(netMinor)*rate+5000n)/10000n;taxMinor=toSafeNumber(tax,"taxMinor");grossMinor=toSafeNumber(BigInt(netMinor)+tax,"grossMinor");
 }
 return{currency,netMinor,taxMinor,grossMinor,discountAmountMinor:original.grossMinor-grossMinor};
}
