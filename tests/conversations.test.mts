import assert from "node:assert/strict";
import test from "node:test";
import {customerVisible,maySendAutomatedReply,statusAfterCustomerMessage,statusAfterStaffReply,validMessageRequestKey} from "../src/server/domain/conversations.ts";
test("human takeover pauses automation until staff resumes it",()=>{
 assert.equal(maySendAutomatedReply({status:"open",humanTakeover:false}),true);
 assert.equal(maySendAutomatedReply({status:"open",humanTakeover:true}),false);
 assert.equal(maySendAutomatedReply({status:"awaiting_customer",humanTakeover:false,customerOptedOut:true}),false);
 assert.equal(maySendAutomatedReply({status:"closed",humanTakeover:false}),false);
});
test("customer messages reopen active conversations and staff replies await the customer",()=>{
 assert.equal(statusAfterCustomerMessage("awaiting_customer"),"open");
 assert.equal(statusAfterCustomerMessage("closed"),"closed");
 assert.equal(statusAfterStaffReply("open"),"awaiting_customer");
 assert.equal(statusAfterStaffReply("closed"),"closed");
});
test("internal staff notes are excluded from customer-visible timelines",()=>{
 assert.equal(customerVisible("customer"),true);
 assert.equal(customerVisible("staff"),true);
 assert.equal(customerVisible("note"),false);
});
test("message request keys are bounded and safe for idempotency indexes",()=>{
 assert.equal(validMessageRequestKey("client_0123456789AB"),true);
 assert.equal(validMessageRequestKey("short"),false);
 assert.equal(validMessageRequestKey("x".repeat(101)),false);
 assert.equal(validMessageRequestKey("../unsafe-key-0000"),false);
});
