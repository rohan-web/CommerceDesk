import {redirect} from "next/navigation";
import type {Action} from "./permissions";
import {requireTenantAccess} from "./tenant-scope";
export async function requirePageTenantAccess(action:Action){
 let access;
 try{access=await requireTenantAccess(action)}catch(error){if(error instanceof Error&&error.message==="PERMISSION_DENIED")redirect("/forbidden");throw error}
 if(!access)redirect("/login");
 return access;
}
