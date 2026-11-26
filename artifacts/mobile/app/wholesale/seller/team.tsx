import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function WholesaleSellerTeamScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_teamTitle")}
      subtitle={t("wholesale_teamSubtitle")}
      stats={[{ label: t("wholesale_members"), value: "3" }]}
      items={[
        {
          title: "Sammy · Owner",
          meta: "All depots",
          href: "/wholesale/seller/settings",
          badge: "Owner",
        },
        {
          title: "Marie · Chat agent",
          meta: "Delmas Depot",
          href: "/wholesale/inquiries",
          badge: "Agent",
        },
        {
          title: "Jean · Depot lead",
          meta: "Yard 3 pickup windows",
          href: "/wholesale/seller/hours",
          badge: "Staff",
        },
      ]}
    />
  );
}
