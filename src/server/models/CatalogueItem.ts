import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 name:{type:String,required:true,trim:true,minlength:2,maxlength:160},
 slug:{type:String,required:true,lowercase:true,trim:true,maxlength:180},
 sku:{type:String,trim:true,uppercase:true,maxlength:80,default:null},
 description:{type:String,trim:true,maxlength:5000,default:""},
 category:{type:String,trim:true,lowercase:true,maxlength:80,default:""},
 storefrontPublished:{type:Boolean,required:true,default:false},
 kind:{type:String,enum:["physical","service"],required:true},
 status:{type:String,enum:["draft","active","archived"],required:true,default:"draft"},
 unitPriceMinor:{type:Number,required:true,min:0,max:Number.MAX_SAFE_INTEGER},
 taxRateBps:{type:Number,required:true,min:0,max:100000},
 taxMode:{type:String,enum:["inclusive","exclusive"],required:true},
 trackInventory:{type:Boolean,required:true,default:false},
 stockOnHand:{type:Number,required:true,min:0,default:0},
 stockReserved:{type:Number,required:true,min:0,default:0},
 serviceDurationMinutes:{type:Number,min:5,max:1440,default:null}
},{timestamps:true,versionKey:"version"});
schema.index({tenantId:1,slug:1},{unique:true});
schema.index({tenantId:1,sku:1},{unique:true,partialFilterExpression:{sku:{$type:"string"}}});
schema.index({tenantId:1,status:1,kind:1,createdAt:-1});
export type CatalogueItemRecord=InferSchemaType<typeof schema>;
export const CatalogueItem:Model<CatalogueItemRecord>=mongoose.models.CatalogueItem??mongoose.model<CatalogueItemRecord>("CatalogueItem",schema);


