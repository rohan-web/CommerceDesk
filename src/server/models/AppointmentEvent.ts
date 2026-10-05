import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 appointmentId:{type:Schema.Types.ObjectId,ref:"Appointment",required:true,immutable:true},
 actorId:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true},
 action:{type:String,required:true,immutable:true,trim:true,maxlength:80},
 details:{type:Schema.Types.Mixed,default:{},immutable:true}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({tenantId:1,appointmentId:1,createdAt:1});
export type AppointmentEventRecord=InferSchemaType<typeof schema>;
export const AppointmentEvent:Model<AppointmentEventRecord>=mongoose.models.AppointmentEvent??mongoose.model<AppointmentEventRecord>("AppointmentEvent",schema);
