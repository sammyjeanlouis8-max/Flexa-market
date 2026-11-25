import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function WholesaleAdminProducts() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell title={t("wholesale.adminProducts", { defaultValue: "Admin · products" })}>
        <div className="space-y-2">
          <WholesaleListCard href="/wholesale/products/101" title="Rice 50lb bags" meta="Haiti · Delmas · active" badge="OK" />
          <WholesaleListCard href="/wholesale/products/102" title="Cooking oil cartons" meta="Haiti · Cap · active" badge="OK" />
          <WholesaleListCard href="/wholesale/products/105" title="Cement bags" meta="Haiti · Yard 3 · flagged stock" badge="Review" />
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
