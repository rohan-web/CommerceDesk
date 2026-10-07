import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({userId:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true},tokenHash:{type:String,required:true,unique:true,select:false},expiresAt:{type:Date,required:true},usedAt:{type:Date,default:null}},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({expiresAt:1},{expireAfterSeconds:0});schema.index({userId:1,usedAt:1,createdAt:-1});
export type PasswordResetTokenRecord=InferSchemaType<typeof schema>;
export const PasswordResetToken:Model<PasswordResetTokenRecord>=mongoose.models.PasswordResetToken??mongoose.model("PasswordResetToken",schema);
