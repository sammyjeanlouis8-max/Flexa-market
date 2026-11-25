import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";

export default function WholesaleSellerEarnings() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.earningsTitle", { defaultValue: "Earnings" })}
        subtitle="Recorded from closed chat deals (no cart checkout)."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <WholesaleStat label="This month" value="$4,280" />
          <WholesaleStat label="Closed chats" value={18} />
          <WholesaleStat label="Pending" value="$640" />
        </div>
        <div className="space-y-2">
          <WholesaleListCard href="/wholesale/seller/inquiries" title="Rice deal · Hotel Karibe" meta="$1,040 · closed chat" badge="Paid" />
          <WholesaleListCard href="/wholesale/seller/inquiries" title="Oil cartons · SuperMax" meta="$762 · closed chat" badge="Paid" />
          <WholesaleListCard href="/wholesale/seller/inquiries" title="Water pallets · Event Pro" meta="$640 · pending confirm" badge="Pending" />
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
