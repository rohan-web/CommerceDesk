import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 name:{type:String,required:true,trim:true,maxlength:120},
 email:{type:String,required:true,lowercase:true,trim:true,maxlength:254},
 passwordHash:{type:String,required:true,select:false},
 disabledAt:{type:Date,default:null}
},{timestamps:true,versionKey:false});
schema.index({email:1},{unique:true});
export type UserRecord=InferSchemaType<typeof schema>;
export const User:Model<UserRecord>=mongoose.models.User??mongoose.model<UserRecord>("User",schema);
