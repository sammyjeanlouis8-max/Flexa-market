import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { MapPin, Package, Plus, Search, Warehouse } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { WholesaleEmpty, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { canAccessWholesale } from "@/lib/wholesaleAccess";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";
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
  const [country, setCountry] = useState(user?.country ?? "");
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) setLocation("/");
  }, [authLoading, allowed, setLocation]);

  useEffect(() => {
    if (user?.country && !country) setCountry(user.country);
  }, [user?.country, country]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    fetchWholesaleProducts({
      q: q.trim() || undefined,
      country: country || undefined,
    })
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
  }, [allowed, q, country]);

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
        defaultValue: "Wholesale only — chat vendors in your country who stock a warehouse.",
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
      <p className="mb-3 rounded-xl border border-[hsl(152,30%,80%)] bg-[hsl(152,40%,96%)] px-3 py-2 text-[12px] text-[hsl(152,40%,24%)] dark:border-[hsl(152,20%,28%)] dark:bg-[hsl(152,18%,14%)] dark:text-[hsl(152,30%,78%)]">
        {t("wholesale.modelNote", {
          defaultValue: "Angro sèlman · pa gen bouton achte · chat ak vandè · depo nan peyi yo.",
        })}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { href: "/wholesale/categories", label: t("wholesale.categoriesTitle", { defaultValue: "Categories" }) },
          { href: "/wholesale/warehouses", label: t("wholesale.depotsTitle", { defaultValue: "Depots" }) },
          { href: "/wholesale/search", label: t("wholesale.searchTitle", { defaultValue: "Search" }) },
          { href: "/wholesale/help", label: t("wholesale.helpTitle", { defaultValue: "How it works" }) },
          { href: "/wholesale/country/Haiti", label: "Haiti" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border/70 bg-white px-3 py-1.5 text-[12px] font-semibold dark:bg-[hsl(152,16%,12%)]"
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("wholesale.searchPlaceholder", { defaultValue: "Search wholesale products…" })}
            className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none ring-[hsl(152,55%,35%)] focus:ring-2 dark:bg-[hsl(152,16%,12%)]"
            data-testid="wholesale-search"
          />
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="h-11 rounded-xl border border-border bg-white px-3 text-sm dark:bg-[hsl(152,16%,12%)]"
          data-testid="wholesale-country-filter"
        >
          <option value="">{t("wholesale.allCountries", { defaultValue: "All countries" })}</option>
          {SUPPORTED_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_FLAGS[c] ? `${COUNTRY_FLAGS[c]} ` : ""}
              {c}
            </option>
          ))}
        </select>
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
            defaultValue: "List bulk stock from your warehouse. Buyers contact you in chat — no checkout.",
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
            const place = [p.city, p.country].filter(Boolean).join(" · ");
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
                    {t("wholesale.bulkBadge", { defaultValue: "Wholesale" })}
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
                  {(place || p.warehouseName) && (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {p.warehouseName ? <Warehouse className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
                      <span className="truncate">
                        {p.warehouseName ? `${p.warehouseName}${p.warehouseCity ? ` · ${p.warehouseCity}` : ""}` : place}
                      </span>
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Warehouse className="h-3.5 w-3.5" />
        {t("wholesale.nativeNote", {
          defaultValue: "Native on Flexa Market · chat-only wholesale · country warehouses",
        })}
      </p>
    </WholesaleShell>
  );
}
