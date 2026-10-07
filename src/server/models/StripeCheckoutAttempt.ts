import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 orderId:{type:Schema.Types.ObjectId,ref:"Order",required:true,immutable:true},
 idempotencyKey:{type:String,required:true,immutable:true,unique:true,trim:true,maxlength:120},
 status:{type:String,enum:["creating","open","complete","expired","failed"],required:true,default:"creating"},
 active:{type:Boolean,required:true,default:true},
 stripeSessionId:{type:String,default:null,trim:true,maxlength:120},
 sessionUrl:{type:String,default:null,select:false,maxlength:2048},
 amountMinor:{type:Number,required:true,min:1,max:Number.MAX_SAFE_INTEGER},
 currency:{type:String,required:true,uppercase:true,match:/^[A-Z]{3}$/},
 expiresAt:{type:Date,required:true}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,orderId:1,active:1},{unique:true,partialFilterExpression:{active:true}});
schema.index({stripeSessionId:1},{unique:true,partialFilterExpression:{stripeSessionId:{$type:"string"}}});
export type StripeCheckoutAttemptRecord=InferSchemaType<typeof schema>;
export const StripeCheckoutAttempt:Model<StripeCheckoutAttemptRecord>=mongoose.models.StripeCheckoutAttempt??mongoose.model<StripeCheckoutAttemptRecord>("StripeCheckoutAttempt",schema);
