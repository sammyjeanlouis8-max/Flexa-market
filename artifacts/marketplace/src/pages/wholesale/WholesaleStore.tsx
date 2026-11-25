import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { MessageCircle, Warehouse } from "lucide-react";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import {
  WholesaleEmpty,
  WholesaleListCard,
  WholesaleShell,
  WholesaleStat,
} from "@/components/wholesale/WholesaleShell";
import {
  fetchWarehouses,
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";

export default function WholesaleStore() {
  const { t } = useTranslation();
  const [, params] = useRoute("/wholesale/stores/:id");
  const id = Number(params?.id);
  const [depot, setDepot] = useState<WholesaleWarehouse | null>(null);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setLoading(false);
      setError(t("wholesale.depotNotFound", { defaultValue: "Depot not found" }));
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchWarehouses({ admin: true, verified: false }),
      fetchWholesaleProducts({ warehouseId: id, limit: 40 }),
    ])
      .then(([warehouses, rows]) => {
        if (cancelled) return;
        const match = warehouses.find((w) => w.id === id) ?? null;
        setDepot(match);
        setProducts(rows);
        setError(match ? null : t("wholesale.depotNotFound", { defaultValue: "Depot not found" }));
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
  }, [id, t]);

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={depot?.sellerName || depot?.name || t("wholesale.depot", { defaultValue: "Depot" })}
        subtitle={
          depot
            ? `${depot.name} · ${depot.city}, ${depot.country}`
            : t("wholesale.loadingDepot", { defaultValue: "Loading depot…" })
        }
        actions={
          depot ? (
            <Link
              href={`/messages?userId=${depot.sellerId}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-[hsl(152,65%,18%)]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat
            </Link>
          ) : undefined
        }
      >
        {error && !loading && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <div className="mt-3">
              <Link href="/wholesale/warehouses" className="font-semibold underline">
                {t("wholesale.backDepots", { defaultValue: "Back to depots" })}
              </Link>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-2xl bg-muted/70" />
            <div className="h-16 animate-pulse rounded-2xl bg-muted/70" />
            <div className="h-16 animate-pulse rounded-2xl bg-muted/70" />
          </div>
        ) : depot ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <WholesaleStat label="Listings" value={products.length} />
              <WholesaleStat label="Country" value={depot.country} />
              <WholesaleStat label="Model" value="Chat only" />
            </div>
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-[hsl(152,30%,80%)] bg-[hsl(152,40%,96%)] px-3 py-2 text-sm text-[hsl(152,40%,24%)]">
              <Warehouse className="h-4 w-4" />
              {depot.name} · {depot.city}
            </div>
            {products.length === 0 ? (
              <WholesaleEmpty
                title={t("wholesale.emptyTitle", { defaultValue: "No wholesale products yet" })}
                body={t("wholesale.emptyDepotBody", {
                  defaultValue: "This depot has no active listings yet.",
                })}
                action={
                  <Link href="/wholesale" className="font-semibold underline">
                    {t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
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
                    meta={`${formatMoney(p.unitPrice, p.currency)} · min ${p.minOrderQty} ${p.wholesaleUnitType}`}
                    badge={p.status}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </WholesaleShell>
    </WholesalePageGate>
  );
}
