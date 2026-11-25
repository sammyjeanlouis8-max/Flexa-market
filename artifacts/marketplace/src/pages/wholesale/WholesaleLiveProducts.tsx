import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import {
  WholesaleEmpty,
  WholesaleListCard,
  WholesaleShell,
  WholesaleStat,
} from "@/components/wholesale/WholesaleShell";
import {
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";

/** Shared live product list — never links to fake demo product IDs. */
export function WholesaleLiveProductsPage({
  title,
  subtitle,
  category,
  country,
  stats,
  emptyTitle = "No wholesale products yet",
  emptyBody = "Listings from verified depots appear here.",
  badge,
}: {
  title: string;
  subtitle?: string;
  category?: string;
  country?: string;
  stats?: Array<{ label: string; value: string | number }>;
  emptyTitle?: string;
  emptyBody?: string;
  badge?: string | ((p: WholesaleProduct) => string | undefined);
}) {
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWholesaleProducts({ category, country, limit: 40 })
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, country]);

  return (
    <WholesalePageGate>
      <WholesaleShell title={title} subtitle={subtitle}>
        {stats && stats.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <WholesaleStat key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        )}
        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/70" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <WholesaleEmpty
            title={emptyTitle}
            body={emptyBody}
            action={
              <Link href="/wholesale" className="text-sm font-semibold underline">
                Back to catalog
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {products.map((p) => (
              <WholesaleListCard
                key={p.id}
                href={`/wholesale/products/${p.id}`}
                title={p.title}
                meta={[
                  formatMoney(p.unitPrice, p.currency),
                  p.city || p.country,
                  `min ${p.minOrderQty}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                badge={typeof badge === "function" ? badge(p) : badge ?? p.status}
              />
            ))}
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}

export function WholesaleLiveProductCards({
  limit = 12,
  badge,
  children,
}: {
  limit?: number;
  badge?: string;
  children?: ReactNode;
}) {
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWholesaleProducts({ limit })
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/70" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="space-y-2">
        {children}
        <Link href="/wholesale" className="inline-block text-sm font-semibold underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {products.map((p) => (
        <WholesaleListCard
          key={p.id}
          href={`/wholesale/products/${p.id}`}
          title={p.title}
          meta={[formatMoney(p.unitPrice, p.currency), p.city || p.country].filter(Boolean).join(" · ")}
          badge={badge ?? p.status}
        />
      ))}
      {children}
    </div>
  );
}
