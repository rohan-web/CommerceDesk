import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 email:{type:String,required:true,trim:true,lowercase:true,maxlength:254,immutable:true},
 role:{type:String,enum:["owner","sales","operations","finance","support"],required:true,immutable:true},
 tokenHash:{type:String,required:true,select:false,immutable:true},
 status:{type:String,enum:["pending","accepted","revoked","expired"],required:true,default:"pending"},
 expiresAt:{type:Date,required:true},acceptedAt:{type:Date,default:null},revokedAt:{type:Date,default:null},createdBy:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true}
},{timestamps:true,versionKey:false});
schema.index({tenantId:1,email:1},{unique:true,partialFilterExpression:{status:"pending"}});
schema.index({tokenHash:1},{unique:true});
schema.index({expiresAt:1},{expireAfterSeconds:60});
export type InvitationRecord=InferSchemaType<typeof schema>;
export const Invitation:Model<InvitationRecord>=mongoose.models.Invitation??mongoose.model("Invitation",schema);
