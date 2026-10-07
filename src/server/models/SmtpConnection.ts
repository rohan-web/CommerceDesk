import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";

const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 host:{type:String,required:true,trim:true,lowercase:true,maxlength:253},
 port:{type:Number,enum:[465,587],required:true},
 secure:{type:Boolean,required:true},
 username:{type:String,required:true,trim:true,maxlength:254},
 passwordEncrypted:{type:String,required:true,select:false,maxlength:2000},
 fromName:{type:String,required:true,trim:true,maxlength:120},
 fromEmail:{type:String,required:true,trim:true,lowercase:true,maxlength:254},
 status:{type:String,enum:["verified","degraded"],required:true,default:"verified"},
 lastVerifiedAt:{type:Date,default:null},
 lastErrorCode:{type:String,default:null,trim:true,maxlength:80}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1},{unique:true});
export type SmtpConnectionRecord=InferSchemaType<typeof schema>;
export const SmtpConnection:Model<SmtpConnectionRecord>=mongoose.models.SmtpConnection??mongoose.model("SmtpConnection",schema);
