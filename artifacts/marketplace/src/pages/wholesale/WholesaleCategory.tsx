import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleEmpty, WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_CATEGORIES } from "@/lib/wholesaleDemo";

export default function WholesaleCategory() {
  const { t } = useTranslation();
  const [, params] = useRoute("/wholesale/categories/:slug");
  const cat = WHOLESALE_CATEGORIES.find((c) => c.slug === params?.slug);

  return (
    <WholesalePageGate>
      <WholesaleShell title={cat?.name ?? t("wholesale.categoriesTitle", { defaultValue: "Category" })}>
        {!cat ? (
          <WholesaleEmpty
            title={t("wholesale.notFound", { defaultValue: "Not found" })}
            body={t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
            action={<Link href="/wholesale/categories" className="text-sm font-semibold underline">Categories</Link>}
          />
        ) : (
          <div className="space-y-2">
            <p className="mb-3 text-sm text-muted-foreground">{cat.count} wholesale listings · chat to buy</p>
            {[1, 2, 3].map((i) => (
              <WholesaleListCard
                key={i}
                href="/wholesale/products/101"
                title={`${cat.name} bulk lot #${i}`}
                meta="Min 10 · Depot in seller country"
                badge="Wholesale"
              />
            ))}
            <Link href="/wholesale" className="mt-4 inline-block text-sm font-semibold text-[hsl(152,55%,28%)] underline">
              {t("wholesale.backCatalog", { defaultValue: "Back to catalog" })}
            </Link>
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}
