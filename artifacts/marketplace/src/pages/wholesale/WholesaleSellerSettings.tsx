import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function WholesaleSellerSettings() {
  const { t } = useTranslation();
  const [company, setCompany] = useState("Caribbean Bulk Co");
  const [chatAuto, setChatAuto] = useState(true);
  const [showStock, setShowStock] = useState(true);

  return (
    <WholesalePageGate>
      <WholesaleShell title={t("wholesale.sellerSettingsTitle", { defaultValue: "Seller settings" })}>
        <form className="space-y-4 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Company name</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Auto-reply in chat for new inquiries</span>
            <input type="checkbox" checked={chatAuto} onChange={(e) => setChatAuto(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Show depot stock on listings</span>
            <input type="checkbox" checked={showStock} onChange={(e) => setShowStock(e.target.checked)} />
          </label>
          <p className="text-xs text-muted-foreground">Checkout stays off — wholesale is chat-only.</p>
          <button type="submit" className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white">Save settings</button>
        </form>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
