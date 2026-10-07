import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";

const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 template:{type:String,enum:["team_invitation","password_reset"],required:true,immutable:true},
 recipient:{type:String,required:true,trim:true,lowercase:true,maxlength:254,immutable:true},
 dedupeKey:{type:String,required:true,trim:true,maxlength:160,immutable:true},
 payloadEncrypted:{type:String,required:true,select:false,maxlength:8000},
 status:{type:String,enum:["queued","sending","sent","failed"],required:true,default:"queued"},
 attempts:{type:Number,required:true,min:0,max:5,default:0},
 nextAttemptAt:{type:Date,required:true,default:Date.now},
 lockedAt:{type:Date,default:null},
 sentAt:{type:Date,default:null},
 providerMessageId:{type:String,default:null,trim:true,maxlength:300},
 lastErrorCode:{type:String,default:null,trim:true,maxlength:80}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,dedupeKey:1},{unique:true});
schema.index({status:1,nextAttemptAt:1,createdAt:1});
schema.index({tenantId:1,createdAt:-1});
export type EmailDeliveryRecord=InferSchemaType<typeof schema>;
export const EmailDelivery:Model<EmailDeliveryRecord>=mongoose.models.EmailDelivery??mongoose.model("EmailDelivery",schema);
