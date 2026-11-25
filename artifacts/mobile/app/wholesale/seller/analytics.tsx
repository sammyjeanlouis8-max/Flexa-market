import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_analyticsTitle")}
      subtitle={t("wholesale_analyticsSubtitle")}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
