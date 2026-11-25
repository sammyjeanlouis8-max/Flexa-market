import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleEmpty, WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";

export default function WholesaleAdminWarehouses() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWarehouses({ admin: true, verified: false })
      .then((rows) => {
        if (!cancelled) {
          setWarehouses(rows);
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
  }, []);

  return (
    <WholesalePageGate>
      <WholesaleShell title={t("wholesale.adminDepots", { defaultValue: "Admin · depots" })}>
        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/70" />
            ))}
          </div>
        ) : warehouses.length === 0 ? (
          <WholesaleEmpty
            title={t("wholesale.noDepots", { defaultValue: "No verified depots yet" })}
            body={t("wholesale.noDepotsBody", {
              defaultValue: "Add and verify a warehouse from Seller tools to list stock here.",
            })}
          />
        ) : (
          <div className="space-y-2">
            {warehouses.map((w) => (
              <WholesaleListCard
                key={w.id}
                href={`/wholesale/stores/${w.id}`}
                title={w.name}
                meta={`${w.city} · ${w.country} · ${w.sellerName || "Seller"}`}
                badge={w.verificationStatus}
              />
            ))}
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}
