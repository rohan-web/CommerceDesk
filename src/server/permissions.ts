export type Action =
 | "tenant:settings" | "members:manage" | "catalogue:read" | "catalogue:write"
 | "stock:write" | "customers:read" | "customers:write" | "conversations:reply"
 | "quotes:write" | "quotes:approve" | "deals:write" | "orders:read" | "orders:write" | "appointments:write"
 | "payments:read" | "payments:verify" | "refunds:approve" | "support:write" | "reports:read";
export type BusinessRole = "owner" | "sales" | "operations" | "finance" | "support";
const grants: Record<BusinessRole, readonly Action[]> = {
 owner: ["tenant:settings","members:manage","catalogue:read","catalogue:write","stock:write","customers:read","customers:write","conversations:reply","quotes:write","quotes:approve","deals:write","orders:read","orders:write","appointments:write","payments:read","payments:verify","refunds:approve","support:write","reports:read"],
 sales: ["catalogue:read","customers:read","customers:write","conversations:reply","quotes:write","deals:write","orders:read","orders:write","appointments:write"],
 operations: ["catalogue:read","customers:read","stock:write","orders:read","orders:write","appointments:write"],
 finance: ["orders:read","payments:read","payments:verify","refunds:approve","reports:read"],
 support: ["customers:read","support:write"]
};
export function can(scope:{role:string;permissions?:readonly string[]},action:Action):boolean {
 if(scope.role==="owner")return true;
 if(action==="members:manage")return false;
 return (grants[scope.role as BusinessRole]??[]).includes(action)||(scope.permissions??[]).includes(action);
}
export function assertPermission(scope:{role:string;permissions?:readonly string[]},action:Action):void {
 if(!can(scope,action))throw new Error("PERMISSION_DENIED");
}



