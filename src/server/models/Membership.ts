import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 userId:{type:Schema.Types.ObjectId,required:true,immutable:true},
 role:{type:String,enum:["owner","sales","operations","finance","support"],required:true},
 permissions:{type:[String],default:[]},revokedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({tenantId:1,userId:1},{unique:true});
schema.index({userId:1,revokedAt:1});
export type MembershipRecord=InferSchemaType<typeof schema>;
export const Membership:Model<MembershipRecord>=mongoose.models.Membership??mongoose.model<MembershipRecord>("Membership",schema);
