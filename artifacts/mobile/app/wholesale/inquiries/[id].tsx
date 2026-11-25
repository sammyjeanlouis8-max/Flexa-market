import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_inquiryTitle")}
      subtitle="Chat thread summary for a wholesale quote."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
