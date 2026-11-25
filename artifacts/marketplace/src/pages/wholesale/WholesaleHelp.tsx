import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

const STEPS = [
  { t: "Browse by country", d: "Only see depots and stock available where you buy." },
  { t: "Open a listing", d: "Check volume tiers, min order, and warehouse location." },
  { t: "Chat the seller", d: "No buy button. Negotiate quantity, pickup, and payment in Market chat." },
  { t: "Pickup at depot", d: "Sellers fulfill from their warehouse in their country." },
];

export default function WholesaleHelp() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.helpTitle", { defaultValue: "How Wholesale works" })}
        subtitle={t("wholesale.helpSubtitle", { defaultValue: "Angro sèlman — chat, pa gen bouton achte." })}
      >
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[hsl(152,45%,32%)]">Step {i + 1}</p>
              <p className="mt-1 font-bold">{s.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/wholesale" className="rounded-xl bg-[hsl(152,55%,28%)] px-4 py-2.5 text-sm font-bold text-white">Browse catalog</Link>
          <Link href="/wholesale/seller/onboarding" className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold">Sell from my depot</Link>
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
