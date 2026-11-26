import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

const SELLERS = [
  {
    title: "Caribbean Bulk Co",
    meta: "2 depots · Haiti · Growth",
    href: "/wholesale/stores/1",
    badge: "Verified",
  },
  {
    title: "Nord Supply",
    meta: "1 depot · Haiti · Starter",
    href: "/wholesale/stores/2",
    badge: "Verified",
  },
  {
    title: "SunTech Wholesale",
    meta: "1 depot · USA · Pro",
    href: "/wholesale/stores/5",
    badge: "Verified",
  },
  {
    title: "Island Depot Partners",
    meta: "1 depot · Jamaica · Pending review",
    href: "/wholesale/admin/warehouses",
    badge: "Pending",
  },
];

export default function WholesaleAdminSellersScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_adminSellers")}
      subtitle="Verified wholesale sellers."
      stats={[
        { label: "Sellers", value: SELLERS.length },
        { label: t("wholesale_status"), value: "3 live" },
      ]}
      items={SELLERS}
    />
  );
}
