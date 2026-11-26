import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function WholesaleSellerPlans() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.plansTitle", { defaultValue: "Seller plans" })}
      >
        <p className="rounded-xl border p-4">{t("wholesale.plansSubtitle")}</p>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
