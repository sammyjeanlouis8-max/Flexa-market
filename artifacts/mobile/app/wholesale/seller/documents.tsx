import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_documentsTitle")}
      subtitle="Invoices & depot papers for chat deals."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
