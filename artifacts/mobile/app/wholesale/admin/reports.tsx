import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function WholesaleAdminReportsScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_adminReports")}
      subtitle={t("wholesale_adminReportsSub")}
      stats={[
        { label: t("wholesale_chats"), value: 410 },
        { label: t("wholesale_closed"), value: 92 },
        { label: t("wholesale_flagged"), value: 2 },
        { label: "Depots live", value: 6 },
      ]}
      items={[
        {
          title: "Haiti report",
          meta: "Chat volume · CSV export preview",
          href: "/wholesale/admin",
          badge: "CSV",
        },
        {
          title: "Depot report",
          meta: "Verified warehouses · CSV export preview",
          href: "/wholesale/admin/warehouses",
          badge: "CSV",
        },
        {
          title: "Inquiry health",
          meta: "Open vs closed chat metrics",
          href: "/wholesale/admin/chats",
          badge: "Chat",
        },
      ]}
    />
  );
}
