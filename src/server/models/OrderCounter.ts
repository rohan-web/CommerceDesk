import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},nextNumber:{type:Number,required:true,default:0,min:0}},{timestamps:true,versionKey:false});
schema.index({tenantId:1},{unique:true});
export type OrderCounterRecord=InferSchemaType<typeof schema>;
export const OrderCounter:Model<OrderCounterRecord>=mongoose.models.OrderCounter??mongoose.model<OrderCounterRecord>("OrderCounter",schema);
