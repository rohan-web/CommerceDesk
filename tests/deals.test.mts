import assert from "node:assert/strict";
import test from "node:test";
import {canMoveDeal,defaultSalesStages,validSalesStageConfiguration} from "../src/server/domain/deals.ts";

test("default sales pipeline has ordered new, won and lost endpoints",()=>assert.equal(validSalesStageConfiguration(defaultSalesStages),true));
test("pipeline configuration rejects duplicate keys, labels and nonterminal outcomes",()=>{
 assert.equal(validSalesStageConfiguration([...defaultSalesStages,{key:"new",label:"Repeat",position:5}]),false);
 assert.equal(validSalesStageConfiguration(defaultSalesStages.map(stage=>stage.key==="won"?{...stage,position:1}:stage.key==="qualified"?{...stage,position:3}:stage)),false);
});
test("a deal can only be won from the final active stage",()=>{
 assert.deepEqual(canMoveDeal({from:"new",to:"won",stages:defaultSalesStages,isOwner:true}),{ok:false,reason:"proposal_required"});
 assert.deepEqual(canMoveDeal({from:"proposal",to:"won",stages:defaultSalesStages,isOwner:false}),{ok:true,reason:"changed"});
});
test("lost outcomes need a reason and reopening a terminal outcome needs an owner",()=>{
 assert.deepEqual(canMoveDeal({from:"qualified",to:"lost",stages:defaultSalesStages,isOwner:false}),{ok:false,reason:"lost_reason_required"});
 assert.deepEqual(canMoveDeal({from:"lost",to:"new",stages:defaultSalesStages,isOwner:false,lostReason:"Changed"}),{ok:false,reason:"reopen_requires_owner"});
 assert.equal(canMoveDeal({from:"lost",to:"new",stages:defaultSalesStages,isOwner:true,lostReason:"Changed"}).ok,true);
});
