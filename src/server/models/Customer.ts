import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const schema=new Schema({
 tenantId:{type:Schema.Types.ObjectId,ref:"Tenant",required:true,immutable:true},
 name:{type:String,required:true,trim:true,minlength:2,maxlength:160},
 email:{type:String,trim:true,lowercase:true,maxlength:254,default:null},
 phone:{type:String,trim:true,maxlength:40,default:null},
 company:{type:String,trim:true,maxlength:160,default:""},
 status:{type:String,enum:["lead","customer","archived"],required:true,default:"lead"},
 tags:{type:[{type:String,trim:true,lowercase:true,maxlength:32}],default:[]},
 notes:{type:String,trim:true,maxlength:4000,default:""},
 emailMarketingOptIn:{type:Boolean,required:true,default:false},emailConsentAt:{type:Date,default:null},
 whatsappMarketingOptIn:{type:Boolean,required:true,default:false},whatsappConsentAt:{type:Date,default:null}
},{timestamps:true,versionKey:"version"});
schema.index({tenantId:1,email:1},{unique:true,partialFilterExpression:{email:{$type:"string"}}});
schema.index({tenantId:1,status:1,updatedAt:-1});
schema.index({tenantId:1,name:1});
export type CustomerRecord=InferSchemaType<typeof schema>;
export const Customer:Model<CustomerRecord>=mongoose.models.Customer??mongoose.model<CustomerRecord>("Customer",schema);
