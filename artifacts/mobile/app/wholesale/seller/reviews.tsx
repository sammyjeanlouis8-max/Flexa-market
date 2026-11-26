import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function WholesaleSellerReviewsScreen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_reviewsTitle")}
      subtitle={t("wholesale_reviewsSubtitle")}
      stats={[{ label: t("wholesale_rating"), value: "4.8" }]}
      items={[
        {
          title: "Hotel Karibe",
          meta: "Fast depot pickup",
          href: "/wholesale/seller/customers",
          badge: "★★★★★",
        },
        {
          title: "Construct SA",
          meta: "Good cement stock",
          href: "/wholesale/seller/customers",
          badge: "★★★★☆",
        },
      ]}
    />
  );
}
