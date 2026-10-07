export type ConversationStatus="open"|"awaiting_customer"|"closed";
export type ConversationDirection="customer"|"staff"|"note";
export function maySendAutomatedReply(state:{status:ConversationStatus;humanTakeover:boolean;customerOptedOut?:boolean}){
 return state.status!=="closed"&&!state.humanTakeover&&!state.customerOptedOut;
}
export function statusAfterCustomerMessage(status:ConversationStatus):ConversationStatus{
 return status==="closed"?"closed":"open";
}
export function statusAfterStaffReply(status:ConversationStatus):ConversationStatus{
 return status==="closed"?"closed":"awaiting_customer";
}
export function validMessageRequestKey(value:string){return /^[A-Za-z0-9_-]{16,100}$/.test(value)}
export function customerVisible(direction:ConversationDirection){return direction==="customer"||direction==="staff"}
