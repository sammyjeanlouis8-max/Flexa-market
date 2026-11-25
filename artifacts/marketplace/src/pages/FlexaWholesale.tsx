import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Package, Plus, Search, Warehouse } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { WholesaleEmpty, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { canAccessWholesale } from "@/lib/wholesaleAccess";
import {
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { cn } from "@/lib/utils";

export default function FlexaWholesale() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const allowed = canAccessWholesale(user);
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) setLocation("/");
  }, [authLoading, allowed, setLocation]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    fetchWholesaleProducts({ q: q.trim() || undefined, country: user?.country ?? undefined })
      .then((list) => {
        if (!cancelled) {
          setProducts(list);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setProducts([]);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, q, user?.country]);

  if (authLoading || !allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return (
    <WholesaleShell
      subtitle={t("wholesale.tagline", {
        defaultValue: "Buy in bulk from verified vendors — one Flexa account, one wallet.",
      })}
      actions={
        <Link
          href="/wholesale/seller"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-[hsl(152,65%,18%)]"
          data-testid="wholesale-add-cta"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("wholesale.sellCta", { defaultValue: "Sell wholesale" })}
        </Link>
      }
    >
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("wholesale.searchPlaceholder", { defaultValue: "Search wholesale products…" })}
          className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none ring-[hsl(152,55%,35%)] focus:ring-2 dark:bg-[hsl(152,16%,12%)]"
          data-testid="wholesale-search"
        />
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted/70" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <WholesaleEmpty
          title={t("wholesale.emptyTitle", { defaultValue: "No wholesale products yet" })}
          body={t("wholesale.emptyBody", {
            defaultValue: "Add your first bulk listing. Super Admin preview — same Flexa Market database.",
          })}
          action={
            <Link
              href="/wholesale/seller"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(152,55%,28%)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              {t("wholesale.createFirst", { defaultValue: "Create wholesale product" })}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map((p) => {
            const img = p.images?.[0];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setLocation(`/wholesale/products/${p.id}`)}
                className={cn(
                  "overflow-hidden rounded-2xl border border-border/70 bg-white text-left shadow-sm",
                  "transition-transform active:scale-[0.99] dark:bg-[hsl(152,16%,12%)]",
                )}
                data-testid={`wholesale-card-${p.id}`}
              >
                <div className="relative aspect-[4/3] bg-[hsl(152,20%,92%)] dark:bg-[hsl(152,18%,18%)]">
                  {img ? (
                    <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[hsl(152,35%,40%)]">
                      <Package className="h-8 w-8" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-md bg-[hsl(152,55%,18%)]/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {t("wholesale.bulkBadge", { defaultValue: "Bulk" })}
                  </span>
                </div>
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{p.title}</p>
                  <p className="text-[13px] font-bold text-[hsl(152,55%,28%)]">
                    {formatMoney(p.unitPrice, p.currency)}
                    <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                      / {p.wholesaleUnitType}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("wholesale.minOrder", { defaultValue: "Min" })} {p.minOrderQty} · {p.sellerName || "Seller"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Warehouse className="h-3.5 w-3.5" />
        {t("wholesale.nativeNote", {
          defaultValue: "Native on Flexa Market · same database · Super Admin preview",
        })}
      </p>
    </WholesaleShell>
  );
}
