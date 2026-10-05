"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./variants.css";

type CatalogueEntry = { id: string; name: string; sku?: string };

function readEntries(payload: unknown): CatalogueEntry[] {
  const root = payload as Record<string, unknown> | null;
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.items)
      ? root.items
      : Array.isArray(root?.catalogue)
        ? root.catalogue
        : Array.isArray(root?.products)
          ? root.products
        : Array.isArray(root?.data)
          ? root.data
          : [];

  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = String(row.id ?? row._id ?? row.itemId ?? "");
    const name = String(row.name ?? row.title ?? row.productName ?? "");
    if (!id || !name) return [];
    return [{ id, name, sku: typeof row.sku === "string" ? row.sku : undefined }];
  });
}

export default function CatalogueVariantPickerPage() {
  const [items, setItems] = useState<CatalogueEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    fetch("/api/catalogue?limit=100", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Could not load catalogue items.");
        return readEntries(payload);
      })
      .then((entries) => { if (current) setItems(entries); })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : "Could not load catalogue items.");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  const visible = items.filter((item) => `${item.name} ${item.sku || ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted-foreground transition hover:text-foreground">← Back to CommerceDesk</Link>
      <section className="variant-hero">
        <div className="variant-hero-copy">
          <p className="variant-kicker">CommerceDesk <span>/</span> Catalogue system</p>
          <h1>More ways to<br /><em>make it yours.</em></h1>
          <p className="variant-hero-description">Build clear product options with their own prices, SKUs and stock. Every choice stays connected to the same order and inventory trail.</p>
          <div className="variant-hero-tags"><span>01 <b>OPTIONS</b></span><i /><span>02 <b>PRICING</b></span><i /><span>03 <b>INVENTORY</b></span></div>
        </div>
        <div className="variant-orbit-stage" aria-hidden="true">
          <div className="variant-orbit variant-orbit-one" />
          <div className="variant-orbit variant-orbit-two" />
          <div className="variant-orbit variant-orbit-three" />
          <div className="variant-core"><span className="variant-core-mark">C</span><span>COMMERCE<br />OBJECT / 001</span></div>
          <div className="variant-float-card variant-float-one"><small>STOCK STATUS</small><b><i /> IN HAND</b><span>One source of truth</span></div>
          <div className="variant-float-card variant-float-two"><small>PRICE LOGIC</small><b>PKR <strong>4,850</strong></b><span>Variant override</span></div>
          <div className="variant-coordinate">24° 51′  N <span>67° 00′  E</span></div>
        </div>
      </section>
      <div className="variant-list-heading">
        <div><span>CATALOGUE / 01</span><h2>Choose a product</h2></div>
        <label className="variant-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or SKU" aria-label="Search products or SKU" />
        </label>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading catalogue…</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && visible.length === 0 ? <p className="rounded-xl border border-border p-6 text-sm text-muted-foreground">No matching catalogue items.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <Link key={item.id} href={`/catalogue/${encodeURIComponent(item.id)}/variants?name=${encodeURIComponent(item.name)}`} className="group rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
            <span className="text-base font-semibold tracking-tight group-hover:text-primary">{item.name}</span>
            {item.sku ? <span className="mt-2 block text-xs text-muted-foreground">SKU {item.sku}</span> : null}
            <span className="mt-5 block text-xs font-medium text-primary">Manage variants →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
