import { NextResponse } from "next/server";
import { connectDatabase } from "@/server/db";
import { requireTenantAccess } from "@/server/tenant-scope";
import { CatalogueItem } from "@/server/models/CatalogueItem";
import { CATALOGUE_CSV_HEADERS, makeCsv } from "@/server/domain/catalogue-csv";

export const dynamic = "force-dynamic";

export async function GET() {
  let access;
  try { access = await requireTenantAccess("catalogue:read"); }
  catch (error) {
    if (error instanceof Error && error.message === "PERMISSION_DENIED") return NextResponse.json({ error: "You do not have permission to read this catalogue." }, { status: 403 });
    return NextResponse.json({ error: "Catalogue service is temporarily unavailable." }, { status: 503 });
  }
  if (!access) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    await connectDatabase();
    const items = await CatalogueItem.find({ tenantId: access.scope.tenantId }).sort({ _id: 1 }).limit(10001).lean();
    if (items.length > 10000) return NextResponse.json({ error: "This workspace exceeds the 10,000-row export limit. Contact support for a bulk export." }, { status: 413 });
    const rows = items.map((item) => [item.name, item.sku, item.description, item.category, item.kind, item.unitPriceMinor, item.taxRateBps, item.taxMode, item.trackInventory, item.serviceDurationMinutes]);
    const csv = makeCsv(CATALOGUE_CSV_HEADERS, rows);
    return new Response(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="commercedesk-catalogue.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "Catalogue service is temporarily unavailable." }, { status: 503 });
  }
}
