import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},accountId:{type:String,required:true,trim:true,match:/^acct_[A-Za-z0-9]+$/,immutable:true},status:{type:String,enum:["connected","degraded","disconnected","setup_required"],required:true,default:"connected"},lastEventAt:{type:Date,default:null},lastErrorCode:{type:String,default:null,trim:true,maxlength:80}},{timestamps:true,versionKey:false});
schema.index({tenantId:1},{unique:true});schema.index({accountId:1},{unique:true});
export type StripeConnectionRecord=InferSchemaType<typeof schema>;
export const StripeConnection:Model<StripeConnectionRecord>=mongoose.models.StripeConnection??mongoose.model<StripeConnectionRecord>("StripeConnection",schema);
