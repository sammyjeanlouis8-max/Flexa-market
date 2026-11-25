import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_WAREHOUSES } from "@/lib/wholesaleDemo";
import { COUNTRY_FLAGS } from "@/lib/countries";

export default function WholesaleCountry() {
  const { t } = useTranslation();
  const [, params] = useRoute("/wholesale/country/:code");
  const code = decodeURIComponent(params?.code ?? "Haiti");
  const flag = COUNTRY_FLAGS[code] ?? "";
  const depots = WHOLESALE_WAREHOUSES.filter((w) => w.country === code);

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={`${flag} ${code}`}
        subtitle={t("wholesale.countrySubtitle", { defaultValue: "Wholesale vendors with depots in this country." })}
      >
        <div className="mb-4 grid grid-cols-2 gap-3">
          <WholesaleStat label="Depots" value={depots.length || WHOLESALE_WAREHOUSES.length} />
          <WholesaleStat label="Buy flow" value="Chat only" />
        </div>
        <div className="space-y-2">
          {(depots.length ? depots : WHOLESALE_WAREHOUSES).map((w) => (
            <WholesaleListCard
              key={w.id}
              href={`/wholesale/stores/${w.id}`}
              title={w.name}
              meta={`${w.city} · ${w.seller}`}
              badge={w.country}
            />
          ))}
        </div>
        <Link href="/wholesale" className="mt-4 inline-block text-sm font-semibold underline">
          {t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
        </Link>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
