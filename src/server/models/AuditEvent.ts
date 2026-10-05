import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 actorId:{type:Schema.Types.ObjectId,default:null},
 action:{type:String,required:true,trim:true,maxlength:100},
 entityType:{type:String,required:true,trim:true,maxlength:80},
 entityId:{type:String,required:true,trim:true,maxlength:120},
 requestId:{type:String,required:true,trim:true,maxlength:120},
 metadata:{type:Schema.Types.Mixed,default:{}}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({tenantId:1,createdAt:-1});
schema.index({tenantId:1,entityType:1,entityId:1,createdAt:-1});
export type AuditEventRecord=InferSchemaType<typeof schema>;
export const AuditEvent:Model<AuditEventRecord>=mongoose.models.AuditEvent??mongoose.model<AuditEventRecord>("AuditEvent",schema);

