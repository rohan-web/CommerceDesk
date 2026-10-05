import assert from "node:assert/strict";
import test from "node:test";
import {isSameOrigin,readJsonLimited} from "../src/server/request-security.ts";

test("accepts only the configured application origin",()=>{
 const prior=process.env.APP_URL;process.env.APP_URL="https://shop.example";
 try{
  assert.equal(isSameOrigin(new Request("https://shop.example/api/orders",{headers:{origin:"https://shop.example"}})),true);
  assert.equal(isSameOrigin(new Request("https://shop.example/api/orders",{headers:{origin:"https://evil.example"}})),false);
  assert.equal(isSameOrigin(new Request("https://shop.example/api/orders")),false);
 }finally{if(prior===undefined)delete process.env.APP_URL;else process.env.APP_URL=prior}
});
test("fails closed when the application origin is not configured",()=>{
 const prior=process.env.APP_URL;delete process.env.APP_URL;
 try{assert.equal(isSameOrigin(new Request("http://localhost/api",{headers:{origin:"http://localhost"}})),false)}finally{if(prior!==undefined)process.env.APP_URL=prior}
});
test("enforces a byte limit without relying on the Content-Length header",async()=>{
 const request=new Request("https://shop.example/api",{method:"POST",body:JSON.stringify({payload:"x".repeat(100)})});
 assert.equal(request.headers.has("content-length"),false);
 assert.deepEqual(await readJsonLimited(request,32),{kind:"too-large"});
});
test("parses bounded JSON and rejects malformed UTF-8 and JSON",async()=>{
 assert.deepEqual(await readJsonLimited(new Request("https://shop.example/api",{method:"POST",body:"{\"ok\":true}"}),64),{kind:"ok",value:{ok:true}});
 assert.equal((await readJsonLimited(new Request("https://shop.example/api",{method:"POST",body:"{"}),64)).kind,"invalid");
 assert.equal((await readJsonLimited(new Request("https://shop.example/api",{method:"POST",body:new Uint8Array([0xc3,0x28])}),64)).kind,"invalid");
});
