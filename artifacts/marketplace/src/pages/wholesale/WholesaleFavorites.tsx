import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleEmpty, WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";

const SAVED = [
  { id: 101, title: "Rice 50lb bags — Port-au-Prince warehouse", meta: "Flexa Delmas Depot · Haiti" },
  { id: 102, title: "Cooking oil cartons (12×1L)", meta: "Nord Wholesale Hub · Haiti" },
];

export default function WholesaleFavorites() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate requireAuth>
      <WholesaleShell
        title={t("wholesale.favoritesTitle", { defaultValue: "Saved wholesale" })}
        subtitle={t("wholesale.favoritesSubtitle", { defaultValue: "Products you saved to chat about later." })}
      >
        {SAVED.length === 0 ? (
          <WholesaleEmpty
            title={t("wholesale.favoritesEmpty", { defaultValue: "No saved products" })}
            body={t("wholesale.favoritesEmptyBody", { defaultValue: "Save bulk listings while you browse." })}
            action={<Link href="/wholesale" className="text-sm font-semibold underline">Catalog</Link>}
          />
        ) : (
          <div className="space-y-2">
            {SAVED.map((p) => (
              <WholesaleListCard key={p.id} href={`/wholesale/products/${p.id}`} title={p.title} meta={p.meta} badge="Saved" />
            ))}
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}
