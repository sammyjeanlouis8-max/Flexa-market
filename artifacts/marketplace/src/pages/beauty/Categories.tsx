import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { BeautyCategoryCard } from "@/components/beauty/BeautyCategoryCard";
import { BEAUTY_PRIMARY_CATEGORIES } from "@/lib/beautyCategoriesCatalog";

function CategoriesBody() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(350,18%,14%)] px-4 py-5 text-white sm:px-5">
        <div className="relative z-10 max-w-[70%]">
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            {t("beauty.allCategoriesTitle", { defaultValue: "All Beauty Categories" })}
          </h2>
          <p className="mt-1 text-sm text-white/75">
            {t("beauty.allCategoriesSubtitle", {
              defaultValue: "Explore all beauty and wellness services.",
            })}
          </p>
        </div>
        <img
          src="https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80"
          alt=""
          className="pointer-events-none absolute -right-2 -top-4 h-28 w-28 rounded-2xl object-cover opacity-90 shadow-lg sm:h-32 sm:w-32"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {BEAUTY_PRIMARY_CATEGORIES.map((tile) => (
          <BeautyCategoryCard
            key={tile.slug}
            href={tile.href}
            labelKey={tile.labelKey}
            fallback={tile.slug}
            photo={tile.photo}
            icon={tile.icon}
          />
        ))}
      </div>

      <p className="text-center text-xs text-[hsl(350,10%,42%)]">
        <Link href="/beauty" className="font-semibold text-[hsl(350,45%,38%)]">
          {t("beauty.backHome", { defaultValue: "Back to Séduire Beauty" })}
        </Link>
      </p>
    </div>
  );
}

export default function BeautyCategoriesPage() {
  const { t } = useTranslation();
  return (
    <BeautyPageGate>
      <BeautyShell
        title={t("beauty.allCategoriesTitle", { defaultValue: "All Beauty Categories" })}
        subtitle={t("beauty.allCategoriesSubtitle", {
          defaultValue: "Explore all beauty and wellness services.",
        })}
      >
        <CategoriesBody />
      </BeautyShell>
    </BeautyPageGate>
  );
}
