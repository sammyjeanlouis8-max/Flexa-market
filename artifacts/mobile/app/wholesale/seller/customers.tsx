import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_customersTitle")}
      subtitle={t("wholesale_customersSubtitle")}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
