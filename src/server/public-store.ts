import {storefrontPolicyVersion} from "./domain/storefront-checkout";
import {connectDatabase} from "./db";
import {Tenant} from "./models/Tenant";
import {CatalogueItem} from "./models/CatalogueItem";
import {CatalogueVariant} from "./models/CatalogueVariant";
export type PublicStoreVariant={id:string;name:string;sku:string|null;unitPriceMinor:number|null;options:{name:string;value:string}[];available:boolean};
export type PublicStoreProduct={id:string;name:string;slug:string;description:string;category:string;unitPriceMinor:number;taxRateBps:number;taxMode:"inclusive"|"exclusive";trackInventory:boolean;available:boolean;variants:PublicStoreVariant[]};
export type PublicStore={name:string;slug:string;description:string;contactEmail:string|null;terms:string;privacy:string;currency:string;deliveryEnabled:boolean;deliveryFlatFeeMinor:number;deliveryTaxRateBps:number;deliveryTaxMode:"inclusive"|"exclusive";pickupEnabled:boolean;bankTransferEnabled:boolean;cashOnPickupEnabled:boolean;reservationMinutes:number;policyVersion:string;products:PublicStoreProduct[]};
export async function loadPublicStore(slug:string):Promise<PublicStore|null>{
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80)return null;await connectDatabase();
 const tenant=await Tenant.findOne({slug,commerceMode:"native",storefrontEnabled:true}).select("name slug storefrontDescription storefrontTerms storefrontPrivacy storefrontContactEmail baseCurrency deliveryEnabled deliveryFlatFeeMinor deliveryTaxRateBps deliveryTaxMode pickupEnabled bankTransferEnabled cashOnPickupEnabled reservationMinutes").lean();if(!tenant)return null;
 const rows=await CatalogueItem.find({tenantId:tenant._id,status:"active",kind:"physical",storefrontPublished:true}).select("name slug description category unitPriceMinor taxRateBps taxMode trackInventory stockOnHand stockReserved").sort({category:1,name:1}).lean();
 const variantRows=rows.length?await CatalogueVariant.find({tenantId:tenant._id,itemId:{$in:rows.map(item=>item._id)},active:true}).select("itemId name sku unitPriceMinor options stockOnHand stockReserved").sort({name:1,_id:1}).lean():[];
 const variantsByItem=new Map<string,typeof variantRows>();for(const variant of variantRows){const key=String(variant.itemId),group=variantsByItem.get(key)||[];group.push(variant);variantsByItem.set(key,group)}
 return{name:tenant.name,slug:tenant.slug,description:tenant.storefrontDescription||"",contactEmail:tenant.storefrontContactEmail||null,terms:tenant.storefrontTerms||"",privacy:tenant.storefrontPrivacy||"",currency:tenant.baseCurrency,deliveryEnabled:tenant.deliveryEnabled,deliveryFlatFeeMinor:tenant.deliveryFlatFeeMinor,deliveryTaxRateBps:tenant.deliveryTaxRateBps,deliveryTaxMode:tenant.deliveryTaxMode,pickupEnabled:tenant.pickupEnabled,bankTransferEnabled:tenant.bankTransferEnabled,cashOnPickupEnabled:tenant.cashOnPickupEnabled,reservationMinutes:tenant.reservationMinutes,policyVersion:storefrontPolicyVersion(tenant.storefrontTerms||"",tenant.storefrontPrivacy||""),products:rows.map(item=>{const variants=variantsByItem.get(String(item._id))||[];return{id:String(item._id),name:item.name,slug:item.slug,description:item.description||"",category:item.category||"",unitPriceMinor:item.unitPriceMinor,taxRateBps:item.taxRateBps,taxMode:item.taxMode as "inclusive"|"exclusive",trackInventory:item.trackInventory,available:variants.length?variants.some(variant=>!item.trackInventory||variant.stockOnHand-variant.stockReserved>0):!item.trackInventory||item.stockOnHand-item.stockReserved>0,variants:variants.map(variant=>({id:String(variant._id),name:variant.name,sku:variant.sku||null,unitPriceMinor:variant.unitPriceMinor??null,options:variant.options.map(option=>({name:option.name,value:option.value})),available:!item.trackInventory||variant.stockOnHand-variant.stockReserved>0}))}})};
}




