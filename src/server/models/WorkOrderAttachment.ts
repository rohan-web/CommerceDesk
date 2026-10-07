import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";

const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 workOrderId:{type:Schema.Types.ObjectId,ref:"WorkOrder",required:true,immutable:true},
 storageKey:{type:String,required:true,immutable:true,match:/^[a-f\d]{64}$/},
 originalName:{type:String,required:true,immutable:true,trim:true,maxlength:120},
 contentType:{type:String,required:true,immutable:true,enum:["application/pdf","image/png","image/jpeg","image/webp"]},
 sizeBytes:{type:Number,required:true,immutable:true,min:1,max:10*1024*1024},
 sha256:{type:String,required:true,immutable:true,match:/^[a-f\d]{64}$/},
 purpose:{type:String,required:true,immutable:true,enum:["supporting","completion_evidence"]},
 uploadedBy:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true},
 status:{type:String,required:true,enum:["ready","deleted"],default:"ready"},
 deletedAt:{type:Date,default:null}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});

schema.index({tenantId:1,workOrderId:1,createdAt:-1});
schema.index({status:1,deletedAt:1});
schema.index({storageKey:1},{unique:true});

export type WorkOrderAttachmentRecord=InferSchemaType<typeof schema>;
export const WorkOrderAttachment:Model<WorkOrderAttachmentRecord>=mongoose.models.WorkOrderAttachment??mongoose.model<WorkOrderAttachmentRecord>("WorkOrderAttachment",schema);
