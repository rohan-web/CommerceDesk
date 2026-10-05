import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 name:{type:String,required:true,trim:true,minlength:2,maxlength:120},
 kind:{type:String,enum:["staff","equipment"],required:true,default:"staff"},
 active:{type:Boolean,required:true,default:true},
 capacity:{type:Number,required:true,min:1,max:20,default:1},
 bufferBeforeMinutes:{type:Number,required:true,min:0,max:240,default:0},
 bufferAfterMinutes:{type:Number,required:true,min:0,max:240,default:0},
 version:{type:Number,required:true,default:0}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,name:1},{unique:true});
schema.index({tenantId:1,active:1,name:1});
export type ServiceResourceRecord=InferSchemaType<typeof schema>;
export const ServiceResource:Model<ServiceResourceRecord>=mongoose.models.ServiceResource??mongoose.model<ServiceResourceRecord>("ServiceResource",schema);
