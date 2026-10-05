import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 _id:{type:String,default:"installation"},
 setupCompletedAt:{type:Date,required:true},tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true},ownerUserId:{type:Schema.Types.ObjectId,ref:"User",required:true}
},{versionKey:false});
export type SetupStateRecord=InferSchemaType<typeof schema>;
export const SetupState:Model<SetupStateRecord>=mongoose.models.SetupState??mongoose.model<SetupStateRecord>("SetupState",schema);
