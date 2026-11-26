import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

const CUSTOMERS = [
  { title: "Hotel Karibe", meta: "3 chats · Haiti · last 2h", href: "/wholesale/inquiries", badge: "Chat" },
  { title: "SuperMax Cap", meta: "1 chat · Haiti · last 5h", href: "/wholesale/inquiries", badge: "Chat" },
  { title: "Construct SA", meta: "2 chats · Haiti · last 1d", href: "/wholesale/inquiries", badge: "Chat" },
];

export default function WholesaleSellerCustomersScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_customersTitle")}
      subtitle={t("wholesale_customersSubtitle")}
      items={CUSTOMERS}
    />
  );
}
