import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function WholesaleSellerEarningsScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_earningsTitle")}
      subtitle={t("wholesale_earningsSubtitle")}
      stats={[
        { label: t("wholesale_thisMonth"), value: "$4,280" },
        { label: t("wholesale_closedChats"), value: 18 },
        { label: "Pending", value: "$640" },
      ]}
      items={[
        {
          title: "Rice deal · Hotel Karibe",
          meta: "$1,040 · closed chat",
          href: "/wholesale/seller/inquiries",
          badge: t("wholesale_paid"),
        },
        {
          title: "Oil cartons · SuperMax",
          meta: "$762 · closed chat",
          href: "/wholesale/seller/inquiries",
          badge: t("wholesale_paid"),
        },
        {
          title: "Water pallets · Event Pro",
          meta: "$640 · pending confirm",
          href: "/wholesale/seller/inquiries",
          badge: "Pending",
        },
      ]}
    />
  );
}
