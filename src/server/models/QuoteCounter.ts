import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const lineSchema=new Schema({itemId:{type:Schema.Types.ObjectId,ref:"CatalogueItem",required:true},quantity:{type:Number,required:true,min:1,max:100000}},{_id:false,versionKey:false});
const schema=new Schema({tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},nextNumber:{type:Number,required:true,default:0,min:0}},{timestamps:true,versionKey:false});schema.index({tenantId:1},{unique:true});
export type QuoteCounterRecord=InferSchemaType<typeof schema>;
export const QuoteCounter:Model<QuoteCounterRecord>=mongoose.models.QuoteCounter??mongoose.model<QuoteCounterRecord>("QuoteCounter",schema);
