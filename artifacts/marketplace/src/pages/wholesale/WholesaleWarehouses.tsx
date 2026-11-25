import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MapPin, Warehouse } from "lucide-react";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleEmpty, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";

export default function WholesaleWarehouses() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWarehouses({ admin: true, verified: true })
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
      <WholesaleShell
        title={t("wholesale.depotsTitle", { defaultValue: "Warehouses & depots" })}
        subtitle={t("wholesale.depotsSubtitle", {
          defaultValue: "Sellers stock a depot in their country. Chat to arrange pickup.",
        })}
      >
        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/70" />
            ))}
          </div>
        ) : warehouses.length === 0 ? (
          <WholesaleEmpty
            title={t("wholesale.noDepots", { defaultValue: "No verified depots yet" })}
            body={t("wholesale.noDepotsBody", {
              defaultValue: "Add and verify a warehouse from Seller tools to list stock here.",
            })}
            action={
              <Link
                href="/wholesale/seller/warehouse"
                className="inline-flex rounded-xl bg-[hsl(152,55%,28%)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                {t("wholesale.addDepot", { defaultValue: "Add warehouse" })}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {warehouses.map((w) => (
              <Link
                key={w.id}
                href={`/wholesale/stores/${w.id}`}
                className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
                data-testid={`wholesale-depot-${w.id}`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(152,40%,92%)] text-[hsl(152,50%,28%)]">
                    <Warehouse className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">{w.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {w.city} · {w.country}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {w.sellerName || t("wholesale.seller", { defaultValue: "Seller" })} ·{" "}
                      {w.verificationStatus}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}
