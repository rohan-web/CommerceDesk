import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 customerId:{type:Schema.Types.ObjectId,ref:"Customer",required:true,immutable:true},
 serviceItemId:{type:Schema.Types.ObjectId,ref:"CatalogueItem",required:true,immutable:true},
 serviceName:{type:String,required:true,immutable:true,trim:true,maxlength:160},
 serviceDurationMinutes:{type:Number,required:true,immutable:true,min:5,max:1440},
 customerName:{type:String,required:true,immutable:true,trim:true,maxlength:160},
 customerEmail:{type:String,default:null,immutable:true,trim:true,lowercase:true,maxlength:254},
 resourceId:{type:Schema.Types.ObjectId,ref:"ServiceResource",required:true},
 resourceName:{type:String,required:true,trim:true,maxlength:120},
 startsAt:{type:Date,required:true},endsAt:{type:Date,required:true},
 bufferedStartsAt:{type:Date,required:true},bufferedEndsAt:{type:Date,required:true},
 businessTimezone:{type:String,required:true,maxlength:80},
 status:{type:String,enum:["held","confirmed","completed","no_show","cancelled","expired"],required:true,default:"held"},
 holdExpiresAt:{type:Date,default:null},
 cancellationPolicyHours:{type:Number,required:true,immutable:true,min:0,max:8760,default:24},
 cancellationNote:{type:String,trim:true,maxlength:500,default:""},
 idempotencyKey:{type:String,required:true,immutable:true,trim:true,maxlength:120},
 requestFingerprint:{type:String,required:true,immutable:true,select:false,maxlength:64},
 manageTokenHash:{type:String,default:null,select:false,maxlength:64},manageTokenExpiresAt:{type:Date,default:null},
 orderId:{type:Schema.Types.ObjectId,ref:"Order",default:null,immutable:true},
 orderLineIndex:{type:Number,default:null,immutable:true,min:0,max:49},
 createdBy:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true},
 version:{type:Number,required:true,default:0}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,startsAt:1,_id:1});
schema.index({tenantId:1,idempotencyKey:1},{unique:true});
schema.index({manageTokenHash:1},{unique:true,partialFilterExpression:{manageTokenHash:{$type:"string"}}});
schema.index({tenantId:1,resourceId:1,status:1,bufferedStartsAt:1,bufferedEndsAt:1});
schema.index({tenantId:1,customerId:1,startsAt:-1});
schema.index({status:1,holdExpiresAt:1});
export type AppointmentRecord=InferSchemaType<typeof schema>;
export const Appointment:Model<AppointmentRecord>=mongoose.models.Appointment??mongoose.model<AppointmentRecord>("Appointment",schema);
