import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 customerId:{type:Schema.Types.ObjectId,ref:"Customer",required:true,immutable:true},
 title:{type:String,required:true,trim:true,minlength:2,maxlength:180},
 stage:{type:String,required:true,lowercase:true,trim:true,minlength:2,maxlength:40,default:"new"},
 valueMinor:{type:Number,required:true,min:0,max:Number.MAX_SAFE_INTEGER,default:0},
 currency:{type:String,required:true,uppercase:true,minlength:3,maxlength:3,immutable:true},
 ownerId:{type:Schema.Types.ObjectId,ref:"User",required:true},
 dueAt:{type:Date,default:null},lostReason:{type:String,trim:true,maxlength:500,default:""},
 version:{type:Number,required:true,default:0}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,stage:1,updatedAt:-1});
schema.index({tenantId:1,ownerId:1,stage:1});
schema.index({tenantId:1,customerId:1,createdAt:-1});
export type DealRecord=InferSchemaType<typeof schema>;
export const Deal:Model<DealRecord>=mongoose.models.Deal??mongoose.model("Deal",schema);
