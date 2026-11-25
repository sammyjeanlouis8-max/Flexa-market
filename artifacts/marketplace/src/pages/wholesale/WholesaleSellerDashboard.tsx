import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";

const LINKS = [
  { href: "/wholesale/seller", label: "My listings" },
  { href: "/wholesale/seller/warehouse", label: "My depot" },
  { href: "/wholesale/seller/inquiries", label: "Buyer chats" },
  { href: "/wholesale/seller/customers", label: "Customers" },
  { href: "/wholesale/seller/earnings", label: "Earnings" },
  { href: "/wholesale/seller/plans", label: "Plans" },
  { href: "/wholesale/seller/settings", label: "Settings" },
];

export default function WholesaleSellerDashboard() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.sellerDashTitle", { defaultValue: "Seller dashboard" })}
        subtitle={t("wholesale.sellerDashSubtitle", { defaultValue: "Monitor depot stock and chat deals — no cart orders." })}
        actions={
          <Link href="/wholesale/seller" className="rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-[hsl(152,65%,18%)]">
            + Listing
          </Link>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <WholesaleStat label="Listings" value={12} />
          <WholesaleStat label="Open chats" value={4} />
          <WholesaleStat label="Depots" value={2} />
          <WholesaleStat label="Country" value="HT" />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-xl border border-border/70 bg-white px-3 py-3 text-center text-xs font-bold dark:bg-[hsl(152,16%,12%)]">
              {l.label}
            </Link>
          ))}
        </div>
        <h2 className="mb-2 text-sm font-bold">Recent chat activity</h2>
        <div className="space-y-2">
          <WholesaleListCard href="/wholesale/seller/inquiries" title="Hotel Karibe · Rice 50lb" meta="Qty 40 · open" badge="Chat" />
          <WholesaleListCard href="/wholesale/seller/inquiries" title="Construct SA · Cement" meta="Qty 200 · open" badge="Chat" />
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
