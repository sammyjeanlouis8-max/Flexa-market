import { useTranslation } from "react-i18next";
import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleRecent() {
  const { t } = useTranslation();
  return (
    <WholesaleLiveProductsPage
      titleKey="wholesale.recentTitle"
      subtitleKey="wholesale.recentSubtitle"
      badge={t("wholesale.badgeLive", { defaultValue: "Live" })}
    />
  );
}
