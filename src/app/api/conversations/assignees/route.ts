import {NextResponse} from "next/server";
import {requireTenantAccess} from "@/server/tenant-scope";
import {Membership} from "@/server/models/Membership";
import {User} from "@/server/models/User";
export const dynamic="force-dynamic";
function fail(error:unknown){if(error instanceof Error&&error.message==="PERMISSION_DENIED")return NextResponse.json({error:"Inbox access is not permitted."},{status:403});return NextResponse.json({error:"Inbox team members are temporarily unavailable."},{status:503})}
export async function GET(){let access;try{access=await requireTenantAccess("conversations:reply")}catch(error){return fail(error)}if(!access)return NextResponse.json({error:"Sign in is required."},{status:401});try{const memberships=await Membership.find({tenantId:access.scope.tenantId,revokedAt:null}).select("userId role").sort({createdAt:1}).lean(),users=await User.find({_id:{$in:memberships.map(m=>m.userId)},disabledAt:null}).select("name email").lean(),byId=new Map(users.map(user=>[String(user._id),user]));return NextResponse.json({members:memberships.flatMap(m=>{const user=byId.get(String(m.userId));return user?[{userId:String(m.userId),name:user.name,email:user.email,role:m.role}]:[]})},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return fail(error)}}
