import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 customerId:{type:Schema.Types.ObjectId,ref:"Customer",required:true,immutable:true},
 orderId:{type:Schema.Types.ObjectId,ref:"Order",default:null,immutable:true},
 kind:{type:String,enum:["question","delivery","return","damaged","other"],required:true,immutable:true},
 subject:{type:String,required:true,trim:true,minlength:3,maxlength:180},
 status:{type:String,enum:["open","assigned","awaiting_customer","awaiting_internal","resolved","closed"],default:"open",required:true},
 assignedTo:{type:Schema.Types.ObjectId,ref:"User",default:null},
 resolution:{type:String,trim:true,maxlength:1200,default:""},
 createdBy:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true},
 updatedBy:{type:Schema.Types.ObjectId,ref:"User",default:null}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,status:1,updatedAt:-1});
schema.index({tenantId:1,customerId:1,createdAt:-1});
schema.index({tenantId:1,orderId:1,createdAt:-1});
export type SupportCaseRecord=InferSchemaType<typeof schema>;
export const SupportCase:Model<SupportCaseRecord>=mongoose.models.SupportCase??mongoose.model<SupportCaseRecord>("SupportCase",schema);
