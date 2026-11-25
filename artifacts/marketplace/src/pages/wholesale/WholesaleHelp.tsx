import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function WholesaleHelp() {
  const { t } = useTranslation();
  const steps = [
    {
      title: t("wholesale.helpStepBrowse", { defaultValue: "Browse by country" }),
      body: t("wholesale.helpStepBrowseBody", {
        defaultValue: "See depot stock available in your account country.",
      }),
    },
    {
      title: t("wholesale.helpStepChat", { defaultValue: "Chat the seller" }),
      body: t("wholesale.helpStepChatBody", {
        defaultValue: "Negotiate MOQ, price, and pickup in Market chat.",
      }),
    },
    {
      title: t("wholesale.helpStepPickup", { defaultValue: "Pickup at the depot" }),
      body: t("wholesale.helpStepPickupBody", {
        defaultValue: "Confirm the deal in chat, then collect from the warehouse.",
      }),
    },
  ];

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.helpTitle", { defaultValue: "How it works" })}
        subtitle={t("wholesale.helpSubtitle", {
          defaultValue: "Wholesale only — chat, no buy button.",
        })}
      >
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[hsl(152,45%,32%)]">
                {t("wholesale.step", { n: i + 1, defaultValue: `Step ${i + 1}` })}
              </p>
              <p className="mt-1 font-bold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/wholesale"
            className="rounded-xl bg-[hsl(152,55%,28%)] px-4 py-2.5 text-sm font-bold text-white"
          >
            {t("wholesale.helpBrowseCatalog", { defaultValue: "Browse catalog" })}
          </Link>
          <Link
            href="/wholesale/seller/onboarding"
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold"
          >
            {t("wholesale.helpSellDepot", { defaultValue: "Sell from my depot" })}
          </Link>
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
