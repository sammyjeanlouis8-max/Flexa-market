import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { MessageCircle, Package, Warehouse } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { canAccessWholesale } from "@/lib/wholesaleAccess";
import {
  fetchWholesaleProduct,
  formatMoney,
  priceForQty,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";

export default function WholesaleProductPage() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/wholesale/products/:id");
  const id = Number(params?.id);
  const allowed = canAccessWholesale(user);
  const [product, setProduct] = useState<WholesaleProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) setLocation("/");
  }, [authLoading, allowed, setLocation]);

  useEffect(() => {
    if (!allowed || !Number.isFinite(id) || id <= 0) return;
    let cancelled = false;
    setLoading(true);
    fetchWholesaleProduct(id)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        setQty(Math.max(1, p.minOrderQty || 1));
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setProduct(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, id]);

  const unit = useMemo(() => (product ? priceForQty(product, qty) : 0), [product, qty]);
  const total = unit * qty;

  if (authLoading || !allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return (
    <WholesaleShell title={product?.title ?? t("nav.flexaWholesale", { defaultValue: "Flexa Wholesale" })}>
      {loading ? (
        <div className="h-72 animate-pulse rounded-2xl bg-muted/70" />
      ) : error || !product ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || t("wholesale.notFound", { defaultValue: "Product not found" })}
          <div className="mt-3">
            <Link href="/wholesale" className="font-semibold underline">
              {t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-white dark:bg-[hsl(152,16%,12%)]">
            <div className="aspect-[4/3] bg-[hsl(152,20%,92%)] dark:bg-[hsl(152,18%,18%)]">
              {product.images?.[0] ? (
                <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-[hsl(152,35%,40%)]">
                  <Package className="h-12 w-12" />
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {product.images.map((src) => (
                  <img key={src} src={src} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[hsl(152,45%,32%)]">
                {product.category || t("wholesale.bulkBadge", { defaultValue: "Bulk" })}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{product.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.sellerName} · {product.country || "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <p className="text-2xl font-extrabold text-[hsl(152,55%,28%)]">
                {formatMoney(unit, product.currency)}
                <span className="ml-1 text-sm font-medium text-muted-foreground">/ {product.wholesaleUnitType}</span>
              </p>
              {product.tiers.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {product.tiers.map((tier) => (
                    <li key={`${tier.minQuantity}-${tier.unitPrice}`} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {tier.minQuantity}
                        {tier.maxQuantity != null ? `–${tier.maxQuantity}` : "+"} {product.wholesaleUnitType}
                      </span>
                      <span className="font-semibold">{formatMoney(tier.unitPrice, product.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("wholesale.quantity", { defaultValue: "Quantity" })}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="h-10 w-10 rounded-lg border border-border text-lg font-bold"
                  onClick={() => setQty((v) => Math.max(product.minOrderQty, v - 1))}
                >
                  −
                </button>
                <input
                  type="number"
                  min={product.minOrderQty}
                  value={qty}
                  onChange={(e) => setQty(Math.max(product.minOrderQty, Number(e.target.value) || product.minOrderQty))}
                  className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-center text-sm font-semibold"
                />
                <button
                  type="button"
                  className="h-10 w-10 rounded-lg border border-border text-lg font-bold"
                  onClick={() => setQty((v) => v + 1)}
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("wholesale.minOrder", { defaultValue: "Min" })} {product.minOrderQty} ·{" "}
                {t("wholesale.stock", { defaultValue: "Stock" })} {product.stockQuantity}
              </p>
              <p className="mt-3 text-lg font-extrabold">
                {t("wholesale.total", { defaultValue: "Total" })}: {formatMoney(total, product.currency)}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {product.contactOnly ? (
                <Link
                  href={`/messages?userId=${product.sellerId}`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t("wholesale.contactSeller", { defaultValue: "Contact seller" })}
                </Link>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white"
                  disabled
                >
                  {t("wholesale.orderSoon", { defaultValue: "Checkout coming soon" })}
                </button>
              )}
              {(product.warehouseName || product.offersWarehousePickup) && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Warehouse className="h-3.5 w-3.5" />
                  {product.warehouseName || t("wholesale.pickup", { defaultValue: "Warehouse pickup available" })}
                  {product.warehouseCity ? ` · ${product.warehouseCity}` : ""}
                </p>
              )}
            </div>

            {product.description && (
              <div className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
                <h3 className="text-sm font-bold">{t("wholesale.description", { defaultValue: "Description" })}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </WholesaleShell>
  );
}
