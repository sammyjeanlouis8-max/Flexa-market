import { useTranslation } from "react-i18next";
import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleFeatured() {
  const { t } = useTranslation();
  return (
    <WholesaleLiveProductsPage
      titleKey="wholesale.featuredTitle"
      subtitleKey="wholesale.featuredSubtitle"
      badge={t("wholesale.badgeHot", { defaultValue: "Hot" })}
    />
  );
}
