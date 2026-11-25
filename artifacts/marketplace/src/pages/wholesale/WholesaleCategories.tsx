import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_CATEGORIES } from "@/lib/wholesaleDemo";

export default function WholesaleCategories() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.categoriesTitle", { defaultValue: "Categories" })}
        subtitle={t("wholesale.categoriesSubtitle", { defaultValue: "Browse wholesale by category — chat only." })}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WHOLESALE_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/wholesale/categories/${c.slug}`}
              className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
              data-testid={`wholesale-category-${c.slug}`}
            >
              <p className="text-sm font-bold">{c.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.count} listings</p>
            </Link>
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
