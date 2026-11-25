import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_plansTitle")}
      subtitle={t("wholesale_plansSubtitle")}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
