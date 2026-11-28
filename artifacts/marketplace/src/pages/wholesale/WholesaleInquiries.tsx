import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_INQUIRIES } from "@/lib/wholesaleDemo";

export default function WholesaleInquiries() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate requireAuth>
      <WholesaleShell
        title={t("wholesale.inquiriesTitle", { defaultValue: "Chat inquiries" })}
        subtitle={t("wholesale.inquiriesSubtitle", { defaultValue: "Quote requests — no checkout. Deals close in Market chat." })}
        actions={
          <Link href="/messages" className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-[hsl(152,65%,18%)]">
            <MessageCircle className="h-3.5 w-3.5" /> Inbox
          </Link>
        }
      >
        <div className="space-y-2">
          {WHOLESALE_INQUIRIES.map((q) => (
            <WholesaleListCard
              key={q.id}
              href="/messages"
              title={`${q.product} · ×${q.qty}`}
              meta={`${q.buyer} · ${q.country} · ${q.ago}`}
              badge={q.status}
            />
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
