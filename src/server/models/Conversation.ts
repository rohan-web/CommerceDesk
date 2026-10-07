import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 customerId:{type:Schema.Types.ObjectId,ref:"Customer",required:true,immutable:true},
 channel:{type:String,enum:["web","whatsapp"],required:true,default:"web"},
 subject:{type:String,trim:true,maxlength:160,default:""},
 status:{type:String,enum:["open","awaiting_customer","closed"],required:true,default:"open"},
 assignedTo:{type:Schema.Types.ObjectId,ref:"User",default:null},
 humanTakeover:{type:Boolean,required:true,default:false},takeoverBy:{type:Schema.Types.ObjectId,ref:"User",default:null},takeoverAt:{type:Date,default:null},
 labels:{type:[{type:String,trim:true,lowercase:true,maxlength:40}],default:[]},
 customerUnreadCount:{type:Number,required:true,min:0,default:0},staffUnreadCount:{type:Number,required:true,min:0,default:0},
 lastMessageAt:{type:Date,default:null},lastMessagePreview:{type:String,trim:true,maxlength:180,default:""},lastMessageDirection:{type:String,enum:["customer","staff","note"],default:null},
 accessTokenHash:{type:String,default:null,select:false,maxlength:64},accessExpiresAt:{type:Date,default:null},
 createdBy:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true}
},{timestamps:true,versionKey:"version"});
schema.index({tenantId:1,status:1,lastMessageAt:-1,_id:-1});schema.index({tenantId:1,customerId:1,lastMessageAt:-1});schema.index({accessTokenHash:1},{unique:true,partialFilterExpression:{accessTokenHash:{$type:"string"}}});
export type ConversationRecord=InferSchemaType<typeof schema>;
export const Conversation:Model<ConversationRecord>=mongoose.models.Conversation??mongoose.model<ConversationRecord>("Conversation",schema);
