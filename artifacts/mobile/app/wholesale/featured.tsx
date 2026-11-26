import { useLanguage } from "@/context/LanguageContext";
import React, { useMemo } from "react";
import { WholesaleProductListScreen } from "@/components/wholesale/WholesaleProductListScreen";
import { formatMoney } from "@/lib/wholesaleApi";

export default function WholesaleFeaturedScreen() {
  const { t } = useLanguage();
  const query = useMemo(() => ({ limit: 40 }), []);

  return (
    <WholesaleProductListScreen
      title={t("wholesale_featuredTitle")}
      subtitle={t("wholesale_featuredSubtitle")}
      query={query}
      badge={t("wholesale_badgeHot")}
      empty="No featured wholesale products yet"
      emptyBody="Highlighted depot stock will appear here. Chat sellers to buy."
      renderMeta={(p) =>
        [
          formatMoney(p.unitPrice, p.currency),
          p.city || p.country,
          `${t("wholesale_minOrder")} ${p.minOrderQty}`,
        ]
          .filter(Boolean)
          .join(" · ")
      }
    />
  );
}
