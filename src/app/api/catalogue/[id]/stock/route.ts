import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import {isSameOrigin,readJsonLimited} from "@/server/request-security";
import { z } from "zod";
import { requireTenantAccess } from "@/server/tenant-scope";
import { CatalogueItem } from "@/server/models/CatalogueItem";
import { CatalogueVariant } from "@/server/models/CatalogueVariant";
import { StockMovement } from "@/server/models/StockMovement";
import { AuditEvent } from "@/server/models/AuditEvent";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const movementSchema = z.object({
  variantId:z.string().regex(/^[a-f\d]{24}$/i).optional(),
  quantityDelta: z.number().int().safe().refine((value) => value !== 0),
  reason: z.enum(["opening", "receipt", "count_correction"]),
  note: z.string().trim().max(500).default(""),
}).strict().superRefine((value, context) => {
  if (value.reason !== "count_correction" && value.quantityDelta < 1) context.addIssue({ code: "custom", path: ["quantityDelta"], message: "Receipts and opening stock must increase stock." });
});
function fail(error: unknown) {
  if (error instanceof Error && error.message === "PERMISSION_DENIED") return NextResponse.json({ error: "You do not have permission to view or adjust stock." }, { status: 403 });
  return NextResponse.json({ error: "Inventory service is temporarily unavailable." }, { status: 503 });
}
export async function GET(_request: Request, context: RouteContext) {
  let access;
  try { access = await requireTenantAccess("catalogue:read"); } catch (error) { return fail(error); }
  if (!access) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  try {
    const item = await CatalogueItem.findOne({ _id: id, tenantId: access.scope.tenantId }).select("_id").lean();
    if (!item) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const movements = await StockMovement.find({ tenantId: access.scope.tenantId, itemId: id }).sort({ createdAt: -1, _id: -1 }).limit(50).populate("actorId", "name").populate("variantId","name options sku").lean();
    return NextResponse.json({ movements }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request, context: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  let access;
  try { access = await requireTenantAccess("stock:write"); } catch (error) { return fail(error); }
  if (!access) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (access.tenant.commerceMode !== "native") return NextResponse.json({ error: "This store is WooCommerce-connected. Stock is managed by the connected store." }, { status: 409 });
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const requestId = request.headers.get("idempotency-key")?.trim();
  if (!requestId || requestId.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) return NextResponse.json({ error: "Supply a stable Idempotency-Key for this stock adjustment." }, { status: 400 });
  const limitedJsonBody=await readJsonLimited(request,24000);if(limitedJsonBody.kind==="too-large")return NextResponse.json({error:"Request is too large."},{status:413});const parsed=movementSchema.safeParse(limitedJsonBody.kind==="ok"?limitedJsonBody.value:null);
  if (!parsed.success) return NextResponse.json({ error: "Review the stock adjustment and try again.", issues: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
  const existing = await StockMovement.findOne({ tenantId: access.scope.tenantId, requestId }).lean().catch(() => null);
  if (existing) {
    if (String(existing.itemId) !== id || String(existing.variantId||"") !== (parsed.data.variantId||"") || existing.quantityDelta !== parsed.data.quantityDelta || existing.reason !== parsed.data.reason) return NextResponse.json({ error: "This Idempotency-Key was already used for a different adjustment." }, { status: 409 });
    return NextResponse.json({ movement: existing, replayed: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const session = await mongoose.startSession();
  let result: unknown;
  try {
    await session.withTransaction(async () => {
      if(parsed.data.variantId){
        const parent=await CatalogueItem.findOne({_id:id,tenantId:access.scope.tenantId,kind:"physical",trackInventory:true}).select("_id").session(session).lean();if(!parent)throw new Error("STOCK_NOT_TRACKED");
        const updatedVariant=await CatalogueVariant.findOneAndUpdate({_id:parsed.data.variantId,itemId:id,tenantId:access.scope.tenantId,active:true,$expr:{$gte:[{$add:["$stockOnHand",parsed.data.quantityDelta]},"$stockReserved"]}},{$inc:{stockOnHand:parsed.data.quantityDelta,version:1}},{new:true,session});
        if(!updatedVariant){const variant=await CatalogueVariant.findOne({_id:parsed.data.variantId,itemId:id,tenantId:access.scope.tenantId}).select("_id").session(session).lean();if(!variant)throw new Error("ITEM_NOT_FOUND");throw new Error("STOCK_UNAVAILABLE")}
        const[movement]=await StockMovement.create([{tenantId:access.scope.tenantId,itemId:id,variantId:updatedVariant._id,actorId:access.scope.userId,requestId,reason:parsed.data.reason,quantityDelta:parsed.data.quantityDelta,stockBefore:updatedVariant.stockOnHand-parsed.data.quantityDelta,stockAfter:updatedVariant.stockOnHand,note:parsed.data.note}],{session});
        await AuditEvent.create([{tenantId:access.scope.tenantId,actorId:access.scope.userId,action:"stock.variant_adjusted",entityType:"catalogue_variant",entityId:String(updatedVariant._id),requestId,metadata:{itemId:id,variantName:updatedVariant.name,reason:movement.reason,quantityDelta:movement.quantityDelta,stockAfter:movement.stockAfter}}],{session});result=movement.toObject();return;
      }
      if(await CatalogueVariant.exists({tenantId:access.scope.tenantId,itemId:id,active:true}).session(session))throw new Error("VARIANT_REQUIRED");
      const filter = {
        _id: id,
        tenantId: access.scope.tenantId,
        kind: "physical",
        trackInventory: true,
        $expr: { $gte: [{ $add: ["$stockOnHand", parsed.data.quantityDelta] }, "$stockReserved"] },
      };
      const updated = await CatalogueItem.findOneAndUpdate(filter, { $inc: { stockOnHand: parsed.data.quantityDelta, version: 1 } }, { new: true, session });
      if (!updated) {
        const item = await CatalogueItem.findOne({ _id: id, tenantId: access.scope.tenantId }).select("kind trackInventory stockOnHand stockReserved").session(session).lean();
        if (!item) throw new Error("ITEM_NOT_FOUND");
        throw new Error("STOCK_UNAVAILABLE");
      }
      const [movement] = await StockMovement.create([{
        tenantId: access.scope.tenantId, itemId: updated._id, actorId: access.scope.userId, requestId,
        reason: parsed.data.reason, quantityDelta: parsed.data.quantityDelta,
        stockBefore: updated.stockOnHand - parsed.data.quantityDelta, stockAfter: updated.stockOnHand, note: parsed.data.note,
      }], { session });
      await AuditEvent.create([{
        tenantId: access.scope.tenantId, actorId: access.scope.userId, action: "stock.adjusted",
        entityType: "catalogue_item", entityId: String(updated._id), requestId,
        metadata: { reason: movement.reason, quantityDelta: movement.quantityDelta, stockAfter: movement.stockAfter },
      }], { session });
      result = movement.toObject();
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (error instanceof Error && error.message === "STOCK_UNAVAILABLE") return NextResponse.json({ error: "Stock must remain at or above the quantity reserved for open orders." }, { status: 409 });
    if (error instanceof Error && error.message === "VARIANT_REQUIRED") return NextResponse.json({ error: "Choose a product variant before adjusting its stock." }, { status: 409 });
    if (error instanceof Error && error.message === "STOCK_NOT_TRACKED") return NextResponse.json({ error: "Enable stock tracking for this product before changing variant stock." }, { status: 409 });
    if ((error as { code?: number })?.code === 11000) {
      const prior = await StockMovement.findOne({ tenantId: access.scope.tenantId, requestId }).lean();
      if (prior && String(prior.itemId) === id && String(prior.variantId||"") === (parsed.data.variantId||"") && prior.quantityDelta === parsed.data.quantityDelta && prior.reason === parsed.data.reason) return NextResponse.json({ movement: prior, replayed: true }, { headers: { "Cache-Control": "private, no-store" } });
      return NextResponse.json({ error: "This Idempotency-Key was already used." }, { status: 409 });
    }
    return fail(error);
  } finally { await session.endSession(); }
  return NextResponse.json({ movement: result, replayed: false }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}




