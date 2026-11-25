import { useLanguage } from "@/context/LanguageContext";
import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleSimplePage
      title={t("wholesale_adminReports")}
      subtitle="Wholesale volume without checkout GMV."

        stats={[
          { label: "Chats", value: 410 },
          { label: "Closed", value: 92 },
        ]}

        items={[
          { title: "Haiti report", meta: "Download CSV", badge: "CSV" },
          { title: "Depot report", meta: "Download CSV", badge: "CSV" },
        ]}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
