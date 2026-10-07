import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 quoteId:{type:Schema.Types.ObjectId,ref:"Quote",required:true,immutable:true},
 quoteRevision:{type:Number,required:true,immutable:true,min:1},
 requesterName:{type:String,required:true,immutable:true,trim:true,minlength:2,maxlength:160},
 message:{type:String,required:true,immutable:true,trim:true,minlength:2,maxlength:1200},
 status:{type:String,enum:["open","resolved"],required:true,default:"open"},
 resolvedAt:{type:Date,default:null},resolvedBy:{type:Schema.Types.ObjectId,ref:"User",default:null}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,quoteId:1,quoteRevision:1},{unique:true});
schema.index({tenantId:1,quoteId:1,createdAt:-1});
export type QuoteCustomerRequestRecord=InferSchemaType<typeof schema>;
export const QuoteCustomerRequest:Model<QuoteCustomerRequestRecord>=mongoose.models.QuoteCustomerRequest??mongoose.model<QuoteCustomerRequestRecord>("QuoteCustomerRequest",schema);
