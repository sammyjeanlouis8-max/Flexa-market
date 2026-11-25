import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

const STEPS = [
  { href: "/wholesale/seller/warehouse", title: "1. Add your depot", body: "Country + warehouse name required." },
  { href: "/wholesale/seller", title: "2. Publish bulk stock", body: "Volume tiers · min qty · chat buyers." },
  { href: "/wholesale/seller/plans", title: "3. Pick a plan", body: "Optional — more depots & featured slots." },
];

export default function WholesaleOnboarding() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.onboardingTitle", { defaultValue: "Start selling wholesale" })}
        subtitle="Sell in your country from your warehouse. Chat only."
      >
        <div className="space-y-3">
          {STEPS.map((s) => (
            <Link key={s.href} href={s.href} className="block rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <p className="font-bold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </Link>
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
