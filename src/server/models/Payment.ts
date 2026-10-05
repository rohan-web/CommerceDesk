import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 orderId:{type:Schema.Types.ObjectId,ref:"Order",required:true,immutable:true},
 direction:{type:String,enum:["capture","refund"],required:true,immutable:true},
 method:{type:String,enum:["cash","bank_transfer","other","stripe"],required:true,immutable:true},
 amountMinor:{type:Number,required:true,immutable:true,min:1,max:Number.MAX_SAFE_INTEGER},
 currency:{type:String,required:true,immutable:true,uppercase:true,match:/^[A-Z]{3}$/},
 reference:{type:String,trim:true,maxlength:120,default:"",immutable:true},
 note:{type:String,trim:true,maxlength:500,default:"",immutable:true},
 idempotencyKey:{type:String,required:true,immutable:true,trim:true,maxlength:120},
 requestFingerprint:{type:String,required:true,immutable:true,select:false,maxlength:64},
 verifiedBy:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true},
 providerEventId:{type:String,default:null,immutable:true,trim:true,maxlength:120}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({tenantId:1,idempotencyKey:1},{unique:true});
schema.index({tenantId:1,orderId:1,createdAt:1});
export type PaymentRecord=InferSchemaType<typeof schema>;
export const Payment:Model<PaymentRecord>=mongoose.models.Payment??mongoose.model<PaymentRecord>("Payment",schema);
