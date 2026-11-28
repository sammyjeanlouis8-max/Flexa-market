import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import { BeautyCard, BeautyCardSkeleton } from "@/components/beauty/BeautyCard";
import { fetchBeautyFavorites, type BeautyBusiness } from "@/lib/beautyApi";

export default function BeautyFavorites() {
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Favorites">
        <Body />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBeautyFavorites()
      .then((list) => {
        if (!cancelled) {
          setRows(list);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <BeautyCardSkeleton />
        <BeautyCardSkeleton />
      </div>
    );
  }
  if (error) return <BeautyEmpty title={t("beauty.loadError")} body="" />;
  if (rows.length === 0) {
    return (
      <BeautyEmpty
        title={t("beauty.emptyFavoritesTitle")}
        body={t("beauty.emptyFavoritesBody")}
        action={
          <Link href="/beauty/discover" className="text-sm font-semibold text-[hsl(350,45%,40%)]">
            {t("beauty.discoverTitle")}
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((b) => (
        <BeautyCard key={b.id} business={b} />
      ))}
    </div>
  );
}
