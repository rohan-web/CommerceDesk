import {randomBytes} from "node:crypto";
import mongoose from "mongoose";
import {connectDatabase} from "./db.ts";
import {PasswordResetToken} from "./models/PasswordResetToken.ts";
import {User} from "./models/User.ts";
import {Session} from "./models/Session.ts";
import {Membership} from "./models/Membership.ts";
import {AuditEvent} from "./models/AuditEvent.ts";
import {hashPassword,hashSessionToken} from "./secrets.ts";
export async function completePasswordReset(token:string,password:string){
 await connectDatabase();const tokenHash=hashSessionToken(token),candidate=await PasswordResetToken.findOne({tokenHash,usedAt:null,expiresAt:{$gt:new Date()}}).select("userId").lean();if(!candidate)return false;const passwordHash=await hashPassword(password),session=await mongoose.startSession();
 try{await session.withTransaction(async()=>{const reset=await PasswordResetToken.findOne({tokenHash,usedAt:null,expiresAt:{$gt:new Date()}}).session(session);if(!reset)throw new Error("RESET_TOKEN_INVALID");const user=await User.findOne({_id:reset.userId,disabledAt:null}).session(session);if(!user)throw new Error("RESET_ACCOUNT_UNAVAILABLE");user.passwordHash=passwordHash;await user.save({session});const usedAt=new Date(),updated=await PasswordResetToken.updateOne({_id:reset._id,usedAt:null,expiresAt:{$gt:usedAt}},{$set:{usedAt}},{session});if(updated.modifiedCount!==1)throw new Error("RESET_TOKEN_INVALID");await PasswordResetToken.updateMany({userId:user._id,usedAt:null},{$set:{usedAt}},{session});await Session.updateMany({userId:user._id,revokedAt:null},{$set:{revokedAt:usedAt}},{session});const memberships=await Membership.find({userId:user._id,revokedAt:null}).select("tenantId").session(session).lean();if(memberships.length)await AuditEvent.create(memberships.map(item=>({tenantId:item.tenantId,actorId:user._id,action:"account.password_reset_completed",entityType:"user",entityId:String(user._id),requestId:randomBytes(12).toString("hex"),metadata:{sessionsRevoked:true}})),{session})})}finally{await session.endSession()}return true;
}
