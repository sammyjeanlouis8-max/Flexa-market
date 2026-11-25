import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_INQUIRIES } from "@/lib/wholesaleDemo";

export default function WholesaleSellerInquiries() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.sellerInquiriesTitle", { defaultValue: "Inbound chats" })}
        subtitle="Quote requests on your warehouse stock."
      >
        <div className="space-y-2">
          {WHOLESALE_INQUIRIES.map((q) => (
            <WholesaleListCard
              key={q.id}
              href="/messages"
              title={`${q.buyer} · ${q.product}`}
              meta={`×${q.qty} · ${q.ago}`}
              badge={q.status}
            />
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
