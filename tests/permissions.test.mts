import assert from "node:assert/strict";
import test from "node:test";
import {can} from "../src/server/permissions.ts";

test("role map separates commerce operations and finance actions",()=>{
 assert.equal(can({role:"owner"},"catalogue:write"),true);
 assert.equal(can({role:"sales"},"orders:read"),true);
 assert.equal(can({role:"sales"},"orders:write"),true);
 assert.equal(can({role:"sales"},"stock:write"),false);
 assert.equal(can({role:"sales"},"deals:write"),true);
 assert.equal(can({role:"operations"},"stock:write"),true);
 assert.equal(can({role:"operations"},"orders:fulfil"),true);
 assert.equal(can({role:"operations"},"workorders:read"),true);
 assert.equal(can({role:"operations"},"workorders:write"),true);
 assert.equal(can({role:"sales"},"workorders:read"),false);
 assert.equal(can({role:"finance"},"workorders:write"),false);
 assert.equal(can({role:"sales"},"orders:fulfil"),false);
 assert.equal(can({role:"operations"},"customers:write"),false);
 assert.equal(can({role:"finance"},"orders:read"),true);
 assert.equal(can({role:"finance"},"orders:write"),false);
 assert.equal(can({role:"support"},"customers:read"),true);
 assert.equal(can({role:"support"},"customers:write"),false);
});
test("membership-specific grants extend a role without replacing its defaults",()=>{
 assert.equal(can({role:"support",permissions:["reports:read"]},"reports:read"),true);
 assert.equal(can({role:"support",permissions:["reports:read"]},"support:write"),true);
 assert.equal(can({role:"support",permissions:["members:manage"]},"members:manage"),false);
 assert.equal(can({role:"owner"},"members:manage"),true);
});

