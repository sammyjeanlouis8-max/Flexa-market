import BeautyDiscover from "@/pages/beauty/Discover";
import { useTranslation } from "react-i18next";
import { useRoute } from "wouter";
import { beautyCategoryBySlug } from "@/lib/beautyCategoriesCatalog";

export function BeautyStudioCategoryPage() {
  const { t } = useTranslation();
  return (
    <BeautyDiscover
      initialCategorySlug="beauty-studio"
      title={t("beauty.catBeautyStudio", { defaultValue: "Beauty Studio" })}
      subtitle={t("beauty.studioBannerBody")}
    />
  );
}

export function BarbershopCategoryPage() {
  const { t } = useTranslation();
  return (
    <BeautyDiscover
      initialCategorySlug="barbershop"
      title={t("beauty.catBarbershop", { defaultValue: "Barbershop" })}
      subtitle={t("beauty.barberBannerBody")}
    />
  );
}

/** Dynamic /beauty/c/:slug for all 12 primary categories. */
export function BeautyCategoryBySlugPage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/beauty/c/:slug");
  const slug = String(params?.slug || "").trim();
  const cat = beautyCategoryBySlug(slug);
  const title = cat
    ? t(cat.labelKey, { defaultValue: cat.slug })
    : t("beauty.discoverTitle", { defaultValue: "Discover" });
  const subtitle = cat?.mobileDelivery
    ? t("beauty.mobileBannerBody", {
        defaultValue: "Professionals who come to you — home and on-the-go.",
      })
    : t("beauty.discoverSubtitle");

  return (
    <BeautyDiscover
      initialCategorySlug={cat?.slug}
      title={title}
      subtitle={subtitle}
    />
  );
}

export default BeautyStudioCategoryPage;
