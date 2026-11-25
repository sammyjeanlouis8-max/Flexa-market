import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_PLANS } from "@/lib/wholesaleDemo";
import { cn } from "@/lib/utils";

export default function WholesaleSellerPlans() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.plansTitle", { defaultValue: "Seller plans" })}
        subtitle="Unlock more depots and featured catalog slots."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {WHOLESALE_PLANS.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-2xl border p-4",
                p.id === "growth"
                  ? "border-[hsl(152,55%,28%)] bg-[hsl(152,40%,96%)] dark:bg-[hsl(152,20%,14%)]"
                  : "border-border/70 bg-white dark:bg-[hsl(152,16%,12%)]",
              )}
            >
              <p className="text-sm font-bold">{p.name}</p>
              <p className="mt-1 text-2xl font-extrabold text-[hsl(152,55%,28%)]">
                {p.price === 0 ? "Free" : `$${p.price}`}
                {p.price > 0 && <span className="text-sm font-medium text-muted-foreground">/mo</span>}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {p.perks.map((perk) => (
                  <li key={perk}>• {perk}</li>
                ))}
              </ul>
              <button type="button" className="mt-4 h-10 w-full rounded-xl bg-[hsl(152,55%,28%)] text-xs font-bold text-white">
                {p.id === "starter" ? "Current" : "Choose"}
              </button>
            </div>
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
