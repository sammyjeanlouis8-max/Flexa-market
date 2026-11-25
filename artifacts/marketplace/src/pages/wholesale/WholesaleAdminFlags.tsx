import { useTranslation } from "react-i18next";
import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleAdminFlags() {
  const { t } = useTranslation();
  return (
    <WholesaleLiveProductsPage
      titleKey="wholesale.adminFlags"
      subtitleKey="wholesale.adminFlagsSub"
      badge={t("wholesale.badgeReview", { defaultValue: "Review" })}
    />
  );
}
