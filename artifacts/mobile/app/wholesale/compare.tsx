import { useLanguage } from "@/context/LanguageContext";
import React, { useMemo } from "react";
import { WholesaleProductListScreen } from "@/components/wholesale/WholesaleProductListScreen";
import { formatMoney } from "@/lib/wholesaleApi";

export default function WholesaleCompareScreen() {
  const { t } = useLanguage();
  const query = useMemo(() => ({ limit: 40 }), []);

  return (
    <WholesaleProductListScreen
      title={t("wholesale_compareTitle")}
      subtitle={t("wholesale_compareSubtitle")}
      query={query}
      stats={[
        { label: "Mode", value: "Chat" },
        { label: "Checkout", value: "—" },
      ]}
      badge={(p) => p.category || "Quote"}
      empty="Nothing to compare yet"
      emptyBody="Live wholesale listings appear here so you can compare price, MOQ, and country before chatting."
      renderMeta={(p) =>
        [
          formatMoney(p.unitPrice, p.currency),
          `MOQ ${p.minOrderQty}`,
          p.country || "—",
        ].join(" · ")
      }
    />
  );
}
