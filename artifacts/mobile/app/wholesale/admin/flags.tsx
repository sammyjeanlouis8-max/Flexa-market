import { useLanguage } from "@/context/LanguageContext";
import React, { useMemo } from "react";
import { WholesaleProductListScreen } from "@/components/wholesale/WholesaleProductListScreen";
import { formatMoney } from "@/lib/wholesaleApi";

export default function WholesaleAdminFlagsScreen() {
  const { t } = useLanguage();
  const query = useMemo(() => ({ limit: 50 }), []);

  return (
    <WholesaleProductListScreen
      title={t("wholesale_adminFlags")}
      subtitle={t("wholesale_adminFlagsSub")}
      query={query}
      badge={(p) => p.status || t("wholesale_badgeReview")}
      empty="No products to review"
      emptyBody="Live wholesale products for admin review appear here."
      renderMeta={(p) =>
        [
          formatMoney(p.unitPrice, p.currency),
          p.sellerName || `#${p.sellerId}`,
          p.country || "—",
        ]
          .filter(Boolean)
          .join(" · ")
      }
    />
  );
}
