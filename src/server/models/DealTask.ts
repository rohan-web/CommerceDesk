import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 dealId:{type:Schema.Types.ObjectId,ref:"Deal",required:true,immutable:true},
 title:{type:String,required:true,trim:true,minlength:2,maxlength:180},
 dueAt:{type:Date,required:true},
 assigneeId:{type:Schema.Types.ObjectId,ref:"User",required:true},
 status:{type:String,enum:["open","completed"],required:true,default:"open"},
 completedAt:{type:Date,default:null},completedBy:{type:Schema.Types.ObjectId,ref:"User",default:null},
 createdBy:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true},
 version:{type:Number,required:true,default:0}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,dealId:1,status:1,dueAt:1});
schema.index({tenantId:1,assigneeId:1,status:1,dueAt:1});
export type DealTaskRecord=InferSchemaType<typeof schema>;
export const DealTask:Model<DealTaskRecord>=mongoose.models.DealTask??mongoose.model("DealTask",schema);
