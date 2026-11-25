import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

const STEPS = [
  { href: "/wholesale/seller/warehouse", titleKey: "wholesale.stepAddDepot", bodyKey: "wholesale.stepAddDepotBody" },
  { href: "/wholesale/seller", titleKey: "wholesale.stepPublish", bodyKey: "wholesale.stepPublishBody" },
  { href: "/wholesale/seller/plans", titleKey: "wholesale.stepPlan", bodyKey: "wholesale.stepPlanBody" },
] as const;

export default function WholesaleOnboarding() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.onboardingTitle", { defaultValue: "Seller onboarding" })}
        subtitle={t("wholesale.onboardingSubtitle")}
      >
        <div className="space-y-3">
          {STEPS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="block rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
            >
              <p className="font-bold">{t(s.titleKey)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t(s.bodyKey)}</p>
            </Link>
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
