import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";

const taskSchema=new Schema({
 title:{type:String,required:true,trim:true,minlength:2,maxlength:180},
 completedAt:{type:Date,default:null},
 completedBy:{type:Schema.Types.ObjectId,ref:"User",default:null},
 createdBy:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true},
 createdAt:{type:Date,required:true,default:Date.now,immutable:true}
},{timestamps:false,versionKey:false});

const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 orderId:{type:Schema.Types.ObjectId,ref:"Order",required:true,immutable:true},
 orderNumber:{type:String,required:true,immutable:true,trim:true,maxlength:32},
 orderLineIndex:{type:Number,required:true,immutable:true,min:0,max:49},
 customerName:{type:String,required:true,immutable:true,maxlength:160},
 serviceName:{type:String,required:true,immutable:true,maxlength:160},
 quantity:{type:Number,required:true,immutable:true,min:1,max:100000},
 completedQuantity:{type:Number,required:true,default:0,min:0,max:100000},
 attachmentCount:{type:Number,required:true,default:0,min:0,max:20},
 status:{type:String,enum:["open","in_progress","completed","cancelled"],required:true,default:"open"},
 assigneeId:{type:Schema.Types.ObjectId,ref:"User",default:null},
 dueAt:{type:Date,default:null},
 tasks:{type:[taskSchema],default:[]},
 createdBy:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true}
},{timestamps:true,versionKey:"version"});

schema.index({tenantId:1,orderId:1,orderLineIndex:1},{unique:true});
schema.index({tenantId:1,status:1,dueAt:1,createdAt:-1});
schema.index({tenantId:1,assigneeId:1,status:1,dueAt:1});

export type WorkOrderRecord=InferSchemaType<typeof schema>;
export const WorkOrder:Model<WorkOrderRecord>=mongoose.models.WorkOrder??mongoose.model<WorkOrderRecord>("WorkOrder",schema);
