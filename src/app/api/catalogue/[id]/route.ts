import mongoose from "mongoose";
import { NextResponse } from "next/server";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import { z } from "zod";
import { requireTenantAccess } from "@/server/tenant-scope";
import { CatalogueItem } from "@/server/models/CatalogueItem";
import { AuditEvent } from "@/server/models/AuditEvent";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(80).optional(),
  storefrontPublished: z.boolean().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  unitPriceMinor: z.number().int().safe().min(0).optional(),
  taxRateBps: z.number().int().safe().min(0).max(100000).optional(),
  taxMode: z.enum(["inclusive", "exclusive"]).optional(),
  trackInventory: z.boolean().optional(),
  serviceDurationMinutes: z.number().int().safe().min(5).max(1440).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field.");
function fail(error: unknown) {
  if (error instanceof Error && error.message === "PERMISSION_DENIED") return NextResponse.json({ error: "You do not have permission to manage this catalogue." }, { status: 403 });
  return NextResponse.json({ error: "Catalogue service is temporarily unavailable." }, { status: 503 });
}
function slugify(value: string) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
  return slug || `item-${randomBytes(5).toString("hex")}`;
}
export async function GET(_request: Request, context: RouteContext) {
  let access;
  try { access = await requireTenantAccess("catalogue:read"); } catch (error) { return fail(error); }
  if (!access) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  try {
    const item = await CatalogueItem.findOne({ _id: id, tenantId: access.scope.tenantId }).lean();
    if (!item) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ item, currency: access.tenant.baseCurrency }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  let access;
  try { access = await requireTenantAccess("catalogue:write"); } catch (error) { return fail(error); }
  if (!access) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (access.tenant.commerceMode !== "native") return NextResponse.json({ error: "This store is WooCommerce-connected. Catalogue edits must be made in the connected store." }, { status: 409 });
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  if (Number(request.headers.get("content-length") || 0) > 16000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const limitedJsonBody=await readJsonLimited(request,24000);if(limitedJsonBody.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=patchSchema.safeParse(limitedJsonBody.kind==="ok"?limitedJsonBody.value:null);
  if (!parsed.success) return NextResponse.json({ error: "Review the product fields and try again.", issues: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
  const session = await mongoose.startSession();
  let result: unknown;
  try {
    await session.withTransaction(async () => {
      const item = await CatalogueItem.findOne({ _id: id, tenantId: access.scope.tenantId }).session(session);
      if (!item) throw new Error("ITEM_NOT_FOUND");
      const next = { ...parsed.data };
      const kind = item.kind;
      const nextTrack = next.trackInventory ?? item.trackInventory;
      const nextDuration = next.serviceDurationMinutes === undefined ? item.serviceDurationMinutes : next.serviceDurationMinutes;
      const nextStatus = next.status ?? item.status;
      if (next.storefrontPublished === true && (kind !== "physical" || nextStatus !== "active")) throw new Error("INVALID_PUBLICATION");
      if (nextStatus !== "active") next.storefrontPublished = false;
      if (kind === "service" && (nextTrack || !nextDuration)) throw new Error("INVALID_SERVICE_INVENTORY");
      if (kind === "physical" && nextDuration != null) throw new Error("INVALID_PHYSICAL_DURATION");
      if (kind === "physical" && nextTrack === false && item.stockOnHand > 0) throw new Error("STOCK_MUST_BE_ZERO");
      const update: Record<string, unknown> = { ...next };
      if (next.sku !== undefined) update.sku = next.sku?.trim() ? next.sku.trim().toUpperCase() : null;
      if (next.name !== undefined) { update.slug = slugify(next.name); update.name = next.name; }
      const currentVersion = Number(item.get("version") ?? 0);
      const updated = await CatalogueItem.findOneAndUpdate(
        { _id: id, tenantId: access.scope.tenantId, version: currentVersion },
        { $set: update, $inc: { version: 1 } },
        { new: true, runValidators: true, session },
      );
      if (!updated) throw new Error("EDIT_CONFLICT");
      await AuditEvent.create([{
        tenantId: access.scope.tenantId, actorId: access.scope.userId, action: "catalogue.item_updated",
        entityType: "catalogue_item", entityId: String(updated._id), requestId: randomBytes(12).toString("hex"),
        metadata: { fields: Object.keys(parsed.data) },
      }], { session });
      result = updated.toObject();
    });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (error instanceof Error && ["INVALID_SERVICE_INVENTORY", "INVALID_PHYSICAL_DURATION", "STOCK_MUST_BE_ZERO", "INVALID_PUBLICATION"].includes(error.message)) return NextResponse.json({ error: "The product type and stock settings are inconsistent. Set stock to zero before disabling inventory tracking." }, { status: 409 });
    if ((error instanceof Error && error.message === "EDIT_CONFLICT") || code === 11000) return NextResponse.json({ error: "This product changed during the edit, or its SKU/name is already in use. Refresh and try again." }, { status: 409 });
    return fail(error);
  } finally { await session.endSession(); }
  return NextResponse.json({ item: result, currency: access.tenant.baseCurrency }, { headers: { "Cache-Control": "private, no-store" } });
}




