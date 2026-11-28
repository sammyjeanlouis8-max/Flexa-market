import BeautyDiscover from "@/pages/beauty/Discover";
import { useTranslation } from "react-i18next";

export function BeautyStudioCategoryPage() {
  const { t } = useTranslation();
  return (
    <BeautyDiscover
      initialType="beauty_studio"
      title={t("beauty.studioBannerTitle")}
      subtitle={t("beauty.studioBannerBody")}
    />
  );
}

export function BarbershopCategoryPage() {
  const { t } = useTranslation();
  return (
    <BeautyDiscover
      initialType="barbershop"
      title={t("beauty.barberBannerTitle")}
      subtitle={t("beauty.barberBannerBody")}
    />
  );
}

export default BeautyStudioCategoryPage;
