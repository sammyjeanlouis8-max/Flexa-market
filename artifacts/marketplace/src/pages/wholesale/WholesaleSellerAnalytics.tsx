import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
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

export default function WholesaleSellerAnalytics() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [depots, setDepots] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchWholesaleProducts({ mine: true, limit: 10 }),
      fetchWarehouses({ mine: true, verified: false }),
    ])
      .then(([p, w]) => {
        if (!cancelled) {
          setProducts(p);
          setDepots(w);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setDepots([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const top = products[0];
  const topDepot = depots[0];

  return (
    <WholesalePageGate>
      <WholesaleShell title={t("wholesale.analyticsTitle")} subtitle={t("wholesale.analyticsSubtitle")}>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <WholesaleStat label={t("wholesale.listings")} value={loading ? "…" : products.length} />
          <WholesaleStat label={t("wholesale.depots")} value={loading ? "…" : depots.length} />
          <WholesaleStat label={t("wholesale.model")} value={t("wholesale.chatOnly")} />
        </div>
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted/70" />
        ) : !top && !topDepot ? (
          <WholesaleEmpty
            title={t("wholesale.noAnalytics")}
            body={t("wholesale.noAnalyticsBody")}
          />
        ) : (
          <div className="space-y-2">
            {top && (
              <WholesaleListCard
                href={`/wholesale/products/${top.id}`}
                title={t("wholesale.topListing")}
                meta={`${top.title} · ${formatMoney(top.unitPrice, top.currency)}`}
                badge="#1"
              />
            )}
            {topDepot && (
              <WholesaleListCard
                href={`/wholesale/stores/${topDepot.id}`}
                title={t("wholesale.topDepot")}
                meta={`${topDepot.name} · ${topDepot.city}`}
                badge="#1"
              />
            )}
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}
