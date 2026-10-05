"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import VariantManager from "../../../VariantManager";

type Item = { _id: string; name: string; unitPriceMinor: number; trackInventory: boolean };

export default function CatalogueVariantsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const itemId = String(params.id || "");
  const [item, setItem] = useState<Item | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/catalogue/${encodeURIComponent(itemId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.item) throw new Error(payload?.error || "Could not load this catalogue item.");
        const row = payload.item as Record<string, unknown>;
        if (typeof row._id !== "string" || typeof row.name !== "string" || !Number.isSafeInteger(row.unitPriceMinor) || typeof row.trackInventory !== "boolean" || typeof payload.currency !== "string") {
          throw new Error("The catalogue item response was incomplete.");
        }
        setItem({ _id: row._id, name: row.name, unitPriceMinor: row.unitPriceMinor as number, trackInventory: row.trackInventory });
        setCurrency(payload.currency);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load this catalogue item.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [itemId]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Catalogue</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Variants</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage product options, prices, SKUs and stock.</p>
      </header>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading product…</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
      {item ? <VariantManager item={item} currency={currency} onClose={() => router.push("/catalogue/variants")} onChanged={() => router.refresh()} /> : null}
    </main>
  );
}
