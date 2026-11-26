import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function WholesaleAdminChatsScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_adminChats")}
      subtitle={t("wholesale_adminSubtitle")}
      stats={[
        { label: t("wholesale_openLabel"), value: 23 },
        { label: t("wholesale_flagged"), value: 2 },
      ]}
      items={[
        {
          title: "Flagged chat #88",
          meta: "Possible spam",
          href: "/wholesale/inquiries",
          badge: "Flag",
        },
        {
          title: "Open · Cement",
          meta: "Construct SA",
          href: "/wholesale/inquiries",
          badge: "Open",
        },
        {
          title: "Open · Rice pallets",
          meta: "Hotel Karibe",
          href: "/wholesale/inquiries",
          badge: "Open",
        },
      ]}
    />
  );
}
