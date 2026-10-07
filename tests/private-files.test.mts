import assert from "node:assert/strict";
import test from "node:test";
import {detectPrivateEvidenceType,privateFileHash,safePrivateFileName} from "../src/server/private-files.ts";

test("private evidence types are detected from file signatures",()=>{
 assert.equal(detectPrivateEvidenceType(Buffer.from("%PDF-1.7\nbody")),"application/pdf");
 assert.equal(detectPrivateEvidenceType(Buffer.from([137,80,78,71,13,10,26,10,0])),"image/png");
 assert.equal(detectPrivateEvidenceType(Buffer.from([255,216,255,0])),"image/jpeg");
 assert.equal(detectPrivateEvidenceType(Buffer.from("RIFFxxxxWEBP")),"image/webp");
 assert.equal(detectPrivateEvidenceType(Buffer.from("not a file")),null);
});

test("private file names lose path separators and control characters",()=>{
 assert.equal(safePrivateFileName("../private\\invoice.pdf"),"_private_invoice.pdf");
 assert.equal(safePrivateFileName("\u0000\u0001"),"evidence-file");
 assert.equal(safePrivateFileName("a".repeat(150)).length,120);
});

test("private evidence hashes use SHA-256",()=>{
 assert.equal(privateFileHash(Buffer.from("hello")),"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});
