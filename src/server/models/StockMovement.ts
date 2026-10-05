import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 itemId:{type:Schema.Types.ObjectId,ref:"CatalogueItem",required:true,immutable:true},
 variantId:{type:Schema.Types.ObjectId,ref:"CatalogueVariant",default:null,immutable:true},
 actorId:{type:Schema.Types.ObjectId,ref:"User",default:null,immutable:true},
 requestId:{type:String,required:true,immutable:true,trim:true,maxlength:120},
 reason:{type:String,enum:["opening","receipt","count_correction","order_fulfilled","order_hold_expired","order_cancelled","return_received"],required:true,immutable:true},
 quantityDelta:{type:Number,required:true,validate:{validator:Number.isSafeInteger,message:"quantityDelta must be a safe integer."}},
 stockBefore:{type:Number,required:true,immutable:true},stockAfter:{type:Number,required:true,immutable:true},
 note:{type:String,trim:true,maxlength:500,default:""}
},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});
schema.index({tenantId:1,requestId:1},{unique:true});
schema.index({tenantId:1,itemId:1,createdAt:-1});
schema.index({tenantId:1,variantId:1,createdAt:-1});
export type StockMovementRecord=InferSchemaType<typeof schema>;
export const StockMovement:Model<StockMovementRecord>=mongoose.models.StockMovement??mongoose.model<StockMovementRecord>("StockMovement",schema);


