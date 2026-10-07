import mongoose,{Schema,type InferSchemaType,type Model} from "mongoose";
const appointmentHoursSchema=new Schema({weekday:{type:Number,required:true,min:0,max:6},openMinute:{type:Number,required:true,min:0,max:1439},closeMinute:{type:Number,required:true,min:1,max:1440}},{_id:false,versionKey:false});
const appointmentClosureSchema=new Schema({startsAt:{type:Date,required:true},endsAt:{type:Date,required:true},label:{type:String,trim:true,maxlength:120,default:""}},{_id:true,versionKey:false});
const salesStageSchema=new Schema({key:{type:String,trim:true,lowercase:true,match:/^[a-z][a-z0-9_-]{1,39}$/,required:true},label:{type:String,trim:true,minlength:2,maxlength:40,required:true},position:{type:Number,min:0,max:11,required:true}},{_id:false,versionKey:false});
const schema=new Schema({
 name:{type:String,required:true,trim:true,maxlength:120},
 slug:{type:String,required:true,lowercase:true,trim:true,maxlength:80},
 deploymentMode:{type:String,enum:["standalone","platform"],required:true},
 commerceMode:{type:String,enum:["native","woocommerce"],required:true},
 baseCurrency:{type:String,required:true,uppercase:true,minlength:3,maxlength:3},
 timezone:{type:String,required:true},setupCompletedAt:{type:Date,default:null},
 storefrontEnabled:{type:Boolean,required:true,default:false},
 storefrontDescription:{type:String,trim:true,maxlength:700,default:""},storefrontTerms:{type:String,trim:true,maxlength:3000,default:""},storefrontPrivacy:{type:String,trim:true,maxlength:3000,default:""},
 storefrontContactEmail:{type:String,trim:true,lowercase:true,maxlength:254,default:null},
 deliveryEnabled:{type:Boolean,required:true,default:false},deliveryFlatFeeMinor:{type:Number,required:true,min:0,max:Number.MAX_SAFE_INTEGER,default:0},deliveryTaxRateBps:{type:Number,required:true,min:0,max:100000,default:0},deliveryTaxMode:{type:String,enum:["inclusive","exclusive"],required:true,default:"exclusive"},
 pickupEnabled:{type:Boolean,required:true,default:false},
 bankTransferEnabled:{type:Boolean,required:true,default:false},bankTransferInstructions:{type:String,trim:true,maxlength:1000,default:""},storefrontPaymentMode:{type:String,enum:["full","deposit"],required:true,default:"full"},storefrontDepositPercentBps:{type:Number,required:true,min:1,max:9999,default:3000},
 cashOnPickupEnabled:{type:Boolean,required:true,default:false},reservationMinutes:{type:Number,required:true,min:5,max:1440,default:30},
 appointmentsEnabled:{type:Boolean,required:true,default:false},appointmentHours:{type:[appointmentHoursSchema],default:[]},appointmentClosures:{type:[appointmentClosureSchema],default:[]},appointmentCancellationHours:{type:Number,required:true,min:0,max:8760,default:24},
 quoteDiscountApprovalThresholdBps:{type:Number,required:true,min:0,max:9999,default:0},
salesStages:{type:[salesStageSchema],default:[{key:"new",label:"New",position:0},{key:"qualified",label:"Qualified",position:1},{key:"proposal",label:"Proposal",position:2},{key:"won",label:"Won",position:3},{key:"lost",label:"Lost",position:4}]}
},{timestamps:true,versionKey:"version"});
schema.index({slug:1},{unique:true});
export type TenantRecord=InferSchemaType<typeof schema>;
export const Tenant:Model<TenantRecord>=mongoose.models.Tenant??mongoose.model<TenantRecord>("Tenant",schema);

