import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 orderId:{type:Schema.Types.ObjectId,ref:"Order",required:true,immutable:true},
 sourcePaymentId:{type:Schema.Types.ObjectId,ref:"Payment",required:true,immutable:true},
 idempotencyKey:{type:String,required:true,immutable:true,trim:true,maxlength:120},
 requestFingerprint:{type:String,required:true,immutable:true,select:false,maxlength:64},
 stripeRefundId:{type:String,default:null,trim:true,maxlength:120},
 paymentIntentId:{type:String,required:true,immutable:true,trim:true,maxlength:120},
 amountMinor:{type:Number,required:true,immutable:true,min:1,max:Number.MAX_SAFE_INTEGER},
 currency:{type:String,required:true,immutable:true,uppercase:true,match:/^[A-Z]{3}$/},
 note:{type:String,default:"",immutable:true,trim:true,maxlength:500},
 status:{type:String,enum:["creating","pending","succeeded","failed","canceled","needs_review"],required:true,default:"creating"},
 active:{type:Boolean,required:true,default:true}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,idempotencyKey:1},{unique:true});
schema.index({tenantId:1,orderId:1,active:1},{unique:true,partialFilterExpression:{active:true}});
schema.index({stripeRefundId:1},{unique:true,partialFilterExpression:{stripeRefundId:{$type:"string"}}});
export type StripeRefundAttemptRecord=InferSchemaType<typeof schema>;
export const StripeRefundAttempt:Model<StripeRefundAttemptRecord>=mongoose.models.StripeRefundAttempt??mongoose.model<StripeRefundAttemptRecord>("StripeRefundAttempt",schema);
