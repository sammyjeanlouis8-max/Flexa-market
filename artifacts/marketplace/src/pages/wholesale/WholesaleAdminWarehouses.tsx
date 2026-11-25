import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_WAREHOUSES } from "@/lib/wholesaleDemo";

export default function WholesaleAdminWarehouses() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell title={t("wholesale.adminDepots", { defaultValue: "Admin · depots" })}>
        <div className="space-y-2">
          {WHOLESALE_WAREHOUSES.map((w) => (
            <WholesaleListCard
              key={w.id}
              href={`/wholesale/stores/${w.id}`}
              title={w.name}
              meta={`${w.city} · ${w.country} · ${w.seller}`}
              badge={`${w.products}`}
            />
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
