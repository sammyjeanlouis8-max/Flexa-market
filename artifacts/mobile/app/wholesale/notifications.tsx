import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function WholesaleNotificationsScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_notificationsTitle")}
      subtitle={t("wholesale_notificationsSubtitle")}
      items={[
        {
          title: "New chat on Rice 50lb bags",
          meta: "Hotel Karibe · 2h ago",
          href: "/wholesale/inquiries",
          badge: "New",
        },
        {
          title: "Depot Delmas stock reminder",
          meta: "Update stock for weekend · 1d",
          href: "/wholesale/seller/warehouse",
          badge: "New",
        },
        {
          title: "Quote accepted · Cement",
          meta: "Construct SA · 2d ago",
          href: "/wholesale/deals",
          badge: "Deal",
        },
      ]}
    />
  );
}
