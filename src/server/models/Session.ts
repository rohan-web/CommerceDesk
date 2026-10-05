import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 userId:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true},
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true},
 tokenHash:{type:String,required:true,unique:true,select:false},
 expiresAt:{type:Date,required:true},revokedAt:{type:Date,default:null}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({expiresAt:1},{expireAfterSeconds:0});
schema.index({tenantId:1,userId:1,revokedAt:1});
export type SessionRecord=InferSchemaType<typeof schema>;
export const Session:Model<SessionRecord>=mongoose.models.Session??mongoose.model<SessionRecord>("Session",schema);

