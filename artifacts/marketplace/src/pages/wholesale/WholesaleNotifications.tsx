import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";

const NOTES = [
  { id: 1, title: "New chat on Rice 50lb bags", meta: "Hotel Karibe · 2h ago", href: "/wholesale/inquiries" },
  { id: 2, title: "Depot Delmas stock reminder", meta: "Update stock for weekend · 1d", href: "/wholesale/seller/warehouse" },
  { id: 3, title: "Growth plan tip", meta: "Feature your Haiti depot · 2d", href: "/wholesale/seller/plans" },
];

export default function WholesaleNotifications() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell title={t("wholesale.notificationsTitle", { defaultValue: "Wholesale alerts" })}>
        <div className="space-y-2">
          {NOTES.map((n) => (
            <WholesaleListCard key={n.id} href={n.href} title={n.title} meta={n.meta} badge="New" />
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
