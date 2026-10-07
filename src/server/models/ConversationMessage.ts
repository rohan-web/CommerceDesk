import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 conversationId:{type:Schema.Types.ObjectId,ref:"Conversation",required:true,immutable:true},
 channel:{type:String,enum:["web","whatsapp"],required:true,immutable:true,default:"web"},
 direction:{type:String,enum:["customer","staff","note"],required:true,immutable:true},
 body:{type:String,required:true,trim:true,minlength:2,maxlength:4000,immutable:true},
 requestKey:{type:String,required:true,immutable:true,trim:true,maxlength:100},
 actorId:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true},
 deliveryStatus:{type:String,enum:["received","sent","failed","not_applicable"],required:true,default:"not_applicable"},deliveryError:{type:String,default:null,trim:true,maxlength:500},
 providerMessageId:{type:String,default:null,trim:true,maxlength:200,immutable:true},providerEventAt:{type:Date,default:null,immutable:true}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({tenantId:1,conversationId:1,createdAt:1,_id:1});schema.index({tenantId:1,conversationId:1,requestKey:1},{unique:true});schema.index({tenantId:1,channel:1,providerMessageId:1},{unique:true,partialFilterExpression:{providerMessageId:{$type:"string"}}});
export type ConversationMessageRecord=InferSchemaType<typeof schema>;
export const ConversationMessage:Model<ConversationMessageRecord>=mongoose.models.ConversationMessage??mongoose.model<ConversationMessageRecord>("ConversationMessage",schema);
