import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function WholesaleAdminSellers() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate requireAuth>
      <WholesaleShell title={t("wholesale.adminSellers", { defaultValue: "Admin · sellers" })}>
        <div className="space-y-2">
          <WholesaleListCard href="/wholesale/stores/1" title="Caribbean Bulk Co" meta="2 depots · Haiti · Growth" badge="Verified" />
          <WholesaleListCard href="/wholesale/stores/2" title="Nord Supply" meta="1 depot · Haiti · Starter" badge="Verified" />
          <WholesaleListCard href="/wholesale/stores/5" title="SunTech Wholesale" meta="1 depot · USA · Pro" badge="Verified" />
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
