import assert from "node:assert/strict";
import test from "node:test";
import {decryptSecret,encryptSecret,hasValidEncryptionKey} from "../src/server/secrets.ts";

test("encrypts receipt secrets with authenticated encryption and rejects tampering or wrong keys",()=>{
 const prior=process.env.APP_ENCRYPTION_KEY;process.env.APP_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64url");
 try{
  assert.equal(hasValidEncryptionKey(),true);
  const secret="private-receipt-token-keep-out-of-storage";const encrypted=encryptSecret(secret);
  assert.notEqual(encrypted,secret);assert.equal(encrypted.includes(secret),false);assert.equal(decryptSecret(encrypted),secret);
  const parts=encrypted.split(":");parts[3]=`${parts[3].slice(0,-1)}${parts[3].endsWith("A")?"B":"A"}`;
  assert.throws(()=>decryptSecret(parts.join(":")));
  process.env.APP_ENCRYPTION_KEY=Buffer.alloc(32,8).toString("base64url");assert.throws(()=>decryptSecret(encrypted));
 }finally{if(prior===undefined)delete process.env.APP_ENCRYPTION_KEY;else process.env.APP_ENCRYPTION_KEY=prior}
});
test("fails closed for missing or malformed encryption keys",()=>{
 const prior=process.env.APP_ENCRYPTION_KEY;
 try{delete process.env.APP_ENCRYPTION_KEY;assert.equal(hasValidEncryptionKey(),false);assert.throws(()=>encryptSecret("x"));process.env.APP_ENCRYPTION_KEY="short";assert.equal(hasValidEncryptionKey(),false)}finally{if(prior===undefined)delete process.env.APP_ENCRYPTION_KEY;else process.env.APP_ENCRYPTION_KEY=prior}
});
