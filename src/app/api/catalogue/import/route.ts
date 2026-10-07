import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { CATALOGUE_CSV_HEADERS, parseCsv } from "@/server/domain/catalogue-csv";
import { isSameOrigin } from "@/server/request-security";
import { connectDatabase } from "@/server/db";
import { requireTenantAccess } from "@/server/tenant-scope";
import { CatalogueItem } from "@/server/models/CatalogueItem";
import { AuditEvent } from "@/server/models/AuditEvent";

export const dynamic = "force-dynamic";
const rowSchema = z.object({
  name: z.string().trim().min(2).max(160), sku: z.string().trim().max(80), description: z.string().max(5000),
  category: z.string().trim().max(80), kind: z.enum(["physical", "service"]),
  unit_price_minor: z.string().regex(/^\d{1,15}$/), tax_rate_bps: z.string().regex(/^\d{1,6}$/),
  tax_mode: z.enum(["inclusive", "exclusive"]), track_inventory: z.enum(["true", "false"]), service_duration_minutes: z.string(),
}).superRefine((row, ctx) => {
  const price = Number(row.unit_price_minor), tax = Number(row.tax_rate_bps), duration = row.service_duration_minutes === "" ? undefined : Number(row.service_duration_minutes);
  if (!Number.isSafeInteger(price)) ctx.addIssue({ code: "custom", path: ["unit_price_minor"], message: "Price must be a safe integer in minor currency units." });
  if (!Number.isSafeInteger(tax) || tax > 100000) ctx.addIssue({ code: "custom", path: ["tax_rate_bps"], message: "Tax must be from 0 to 100000 basis points." });
  if (row.kind === "service" && (!Number.isInteger(duration) || duration! < 5 || duration! > 1440 || row.track_inventory === "true")) ctx.addIssue({ code: "custom", path: ["service_duration_minutes"], message: "Services need a 5–1440 minute duration and cannot track stock." });
  if (row.kind === "physical" && duration !== undefined) ctx.addIssue({ code: "custom", path: ["service_duration_minutes"], message: "Physical products must leave service duration blank." });
});
function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
}
function fail(error: unknown) {
  if (error instanceof Error && error.message === "PERMISSION_DENIED") return NextResponse.json({ error: "You do not have permission to manage this catalogue." }, { status: 403 });
  return NextResponse.json({ error: "Catalogue service is temporarily unavailable." }, { status: 503 });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  let access;
  try { access = await requireTenantAccess("catalogue:write"); } catch (error) { return fail(error); }
  if (!access) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (access.tenant.commerceMode !== "native") return NextResponse.json({ error: "This catalogue is managed by the connected store." }, { status: 409 });
  if (!request.body) return NextResponse.json({ error: "Upload a CSV file." }, { status: 400 });
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 1_000_000) { await reader.cancel(); return NextResponse.json({ error: "CSV files are limited to 1 MB." }, { status: 413 }); }
      chunks.push(value);
    }
  } catch { return NextResponse.json({ error: "The CSV upload could not be read." }, { status: 400 }); }
  finally { try { reader.releaseLock(); } catch { /* The reader may already be cancelled. */ } }
  let text: string;
  try { const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return NextResponse.json({ error: "CSV must be valid UTF-8 text." }, { status: 400 }); }
  const parsed = parseCsv(text);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.headers.length !== CATALOGUE_CSV_HEADERS.length || CATALOGUE_CSV_HEADERS.some((header, index) => parsed.headers[index] !== header)) return NextResponse.json({ error: `Use the CommerceDesk CSV template with these columns in order: ${CATALOGUE_CSV_HEADERS.join(", ")}.` }, { status: 400 });
  if (!parsed.records.length || parsed.records.length > 500) return NextResponse.json({ error: "Import between 1 and 500 catalogue rows at a time." }, { status: 400 });
  const issues: { row: number; message: string }[] = [], rows: { sourceRow: number; data: z.infer<typeof rowSchema> }[] = [];
  for (const record of parsed.records) {
    const result = rowSchema.safeParse(record.values);
    if (!result.success) { issues.push({ row: record.row, message: result.error.issues.map((issue) => issue.message).join(" ") }); continue; }
    rows.push({ sourceRow: record.row, data: result.data });
    if (issues.length >= 25) break;
  }
  const skus = new Set<string>(), slugs = new Set<string>();
  rows.forEach(({ sourceRow, data: row }) => {
    const sku = row.sku.trim().toUpperCase(), slug = slugify(row.name);
    if (sku && skus.has(sku)) issues.push({ row: sourceRow, message: "SKU is duplicated in this file." });
    if (sku) skus.add(sku);
    if (slug && slugs.has(slug)) issues.push({ row: sourceRow, message: "Product name creates a duplicate URL slug in this file." });
    if (slug) slugs.add(slug);
  });
  if (issues.length) return NextResponse.json({ error: "No products were imported. Fix these rows and upload the file again.", issues: issues.slice(0, 25) }, { status: 422 });

  try { await connectDatabase(); } catch (error) { return fail(error); }
  const existing: Record<string, unknown>[] = [];
  if (skus.size || slugs.size) {
    const or: Record<string, unknown>[] = [];
    if (skus.size) or.push({ sku: { $in: [...skus] } });
    if (slugs.size) or.push({ slug: { $in: [...slugs] } });
    existing.push(...await CatalogueItem.find({ tenantId: access.scope.tenantId, $or: or }).select("sku slug").lean());
  }
  if (existing.length) return NextResponse.json({ error: "No products were imported. A SKU or product URL already exists in this workspace.", issues: [{ row: 0, message: "Remove or change the conflicting SKU or product name, then retry." }] }, { status: 409 });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const documents = rows.map(({ data: row }) => ({
        tenantId: access.scope.tenantId, name: row.name, slug: slugify(row.name) || `item-${randomBytes(5).toString("hex")}`,
        sku: row.sku.trim() ? row.sku.trim().toUpperCase() : null, description: row.description, category: row.category.trim().toLowerCase(),
        storefrontPublished: false, kind: row.kind, status: "draft" as const, unitPriceMinor: Number(row.unit_price_minor), taxRateBps: Number(row.tax_rate_bps),
        taxMode: row.tax_mode, trackInventory: row.kind === "physical" && row.track_inventory === "true", stockOnHand: 0, stockReserved: 0,
        serviceDurationMinutes: row.kind === "service" ? Number(row.service_duration_minutes) : null,
      }));
      const created = await CatalogueItem.insertMany(documents, { session, ordered: true });
      await AuditEvent.insertMany(created.map((item) => ({ tenantId: access.scope.tenantId, actorId: access.scope.userId,
        action: "catalogue.item_imported", entityType: "catalogue_item", entityId: String(item._id), requestId: randomBytes(12).toString("hex"),
        metadata: { kind: item.kind, status: item.status, source: "csv" },
      })), { session, ordered: true });
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return NextResponse.json({ error: "Import stopped because a SKU or product URL was added concurrently. Refresh the catalogue and retry." }, { status: 409 });
    return fail(error);
  } finally { await session.endSession(); }
  return NextResponse.json({ imported: rows.length, status: "draft", stock: "unchanged" }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
