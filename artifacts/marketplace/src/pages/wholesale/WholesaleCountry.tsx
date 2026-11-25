import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import {
  WholesaleEmpty,
  WholesaleListCard,
  WholesaleShell,
  WholesaleStat,
} from "@/components/wholesale/WholesaleShell";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { fetchWarehouses, type WholesaleWarehouse } from "@/lib/wholesaleApi";

export default function WholesaleCountry() {
  const { t } = useTranslation();
  const [, params] = useRoute("/wholesale/country/:code");
  const code = decodeURIComponent(params?.code ?? "Haiti");
  const flag = COUNTRY_FLAGS[code] ?? "";
  const [depots, setDepots] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWarehouses({ admin: true, country: code, verified: true })
      .then((rows) => {
        if (!cancelled) {
          setDepots(rows);
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
  }, [code]);

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={`${flag} ${code}`}
        subtitle={t("wholesale.countrySubtitle", {
          defaultValue: "Wholesale vendors with depots in this country.",
        })}
      >
        <div className="mb-4 grid grid-cols-2 gap-3">
          <WholesaleStat label="Depots" value={loading ? "…" : depots.length} />
          <WholesaleStat label="Buy flow" value="Chat only" />
        </div>
        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/70" />
            ))}
          </div>
        ) : depots.length === 0 ? (
          <WholesaleEmpty
            title={t("wholesale.noDepots", { defaultValue: "No verified depots yet" })}
            body={t("wholesale.noDepotsCountry", {
              defaultValue: "No verified warehouses in this country yet.",
            })}
            action={
              <Link href="/wholesale" className="text-sm font-semibold underline">
                {t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {depots.map((w) => (
              <WholesaleListCard
                key={w.id}
                href={`/wholesale/stores/${w.id}`}
                title={w.name}
                meta={`${w.city} · ${w.sellerName || "Seller"}`}
                badge={w.country}
              />
            ))}
          </div>
        )}
        <Link href="/wholesale" className="mt-4 inline-block text-sm font-semibold underline">
          {t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
        </Link>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
