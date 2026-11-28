import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function WholesaleSellerPlans() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate requireAuth>
      <WholesaleShell
        title={t("wholesale.plansTitle", { defaultValue: "Seller plans" })}
      >
        <p className="rounded-xl border p-4 text-sm text-muted-foreground" data-testid="wholesale-plans-free">
          {t("wholesale.plansFreeLaunch", {
            defaultValue:
              "Flexa Wholesale is free during the initial public launch. No subscription charges are active.",
          })}
        </p>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
