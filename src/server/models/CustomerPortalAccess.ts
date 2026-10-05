import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},customerId:{type:Schema.Types.ObjectId,ref:"Customer",required:true,immutable:true},tokenHash:{type:String,default:null,select:false,maxlength:64},expiresAt:{type:Date,default:null},issuedBy:{type:Schema.Types.ObjectId,ref:"User",default:null},lastAccessAt:{type:Date,default:null}},{timestamps:true,versionKey:false});
schema.index({tenantId:1,customerId:1},{unique:true});schema.index({tokenHash:1},{unique:true,partialFilterExpression:{tokenHash:{$type:"string"}}});
export type CustomerPortalAccessRecord=InferSchemaType<typeof schema>;
export const CustomerPortalAccess:Model<CustomerPortalAccessRecord>=mongoose.models.CustomerPortalAccess??mongoose.model<CustomerPortalAccessRecord>("CustomerPortalAccess",schema);
