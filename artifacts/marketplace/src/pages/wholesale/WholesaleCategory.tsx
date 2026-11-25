import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleEmpty, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_CATEGORIES } from "@/lib/wholesaleDemo";
import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleCategory() {
  const { t } = useTranslation();
  const [, params] = useRoute("/wholesale/categories/:slug");
  const cat = WHOLESALE_CATEGORIES.find((c) => c.slug === params?.slug);

  if (!cat) {
    return (
      <WholesalePageGate>
        <WholesaleShell title={t("wholesale.categoriesTitle", { defaultValue: "Category" })}>
          <WholesaleEmpty
            title={t("wholesale.notFound", { defaultValue: "Not found" })}
            body={t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
            action={
              <Link href="/wholesale/categories" className="text-sm font-semibold underline">
                Categories
              </Link>
            }
          />
        </WholesaleShell>
      </WholesalePageGate>
    );
  }

  return (
    <WholesaleLiveProductsPage
      title={cat.name}
      subtitle={t("wholesale.categoryLive", { defaultValue: "Live wholesale listings · chat to buy" })}
      category={cat.name}
      badge="Wholesale"
    />
  );
}
