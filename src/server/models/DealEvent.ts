import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 dealId:{type:Schema.Types.ObjectId,ref:"Deal",required:true,immutable:true},
 actorId:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true},
 action:{type:String,required:true,trim:true,maxlength:80,immutable:true},
 details:{type:Schema.Types.Mixed,default:{},immutable:true}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({tenantId:1,dealId:1,createdAt:1});
export type DealEventRecord=InferSchemaType<typeof schema>;
export const DealEvent:Model<DealEventRecord>=mongoose.models.DealEvent??mongoose.model("DealEvent",schema);
