import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  fetchBeautyCenterOverview,
  fetchMyBeautyBusinesses,
  formatBeautyPrice,
  type BeautyBusiness,
  type BeautyCenterOverview,
} from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

export default function BeautyCenterDashboard() {
  const { businessId } = useParams<{ businessId?: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Beauty Center">
        {businessId ? <Overview id={Number(businessId)} /> : <Picker />}
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Picker() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyBeautyBusinesses()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>;
  if (rows.length === 0) {
    return (
      <BeautyEmpty
        title={t("beauty.emptyTitle")}
        body={t("beauty.onboardingSubtitle")}
        action={
          <Link href="/beauty/onboarding" className="text-sm font-semibold text-[hsl(350,45%,40%)]">
            {t("beauty.registerBusiness")}
          </Link>
        }
      />
    );
  }
  if (rows.length === 1) {
    window.location.replace(`/beauty/center/${rows[0].id}`);
    return null;
  }
  return (
    <div className="space-y-2">
      {rows.map((b) => (
        <Link
          key={b.id}
          href={`/beauty/center/${b.id}`}
          className="block rounded-xl border border-[hsl(350,20%,88%)] bg-white px-4 py-3"
        >
          <p className="font-bold text-sm">{b.name}</p>
          <p className="text-xs text-muted-foreground">{b.status}</p>
        </Link>
      ))}
    </div>
  );
}

function Overview({ id }: { id: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<BeautyCenterOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBeautyCenterOverview(id)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>;
  if (error || !data) return <BeautyEmpty title={t("beauty.loadError")} body="" />;

  const { business, stats } = data;
  const cards = [
    { label: t("beauty.todayAppointments"), value: String(stats.todayAppointments) },
    { label: t("beauty.pendingConfirmation"), value: String(stats.pendingConfirmation) },
    { label: t("beauty.completedAllTime"), value: String(stats.completedAllTime) },
    {
      label: t("beauty.revenue"),
      value: formatBeautyPrice(stats.revenue, business.currency),
    },
    { label: t("beauty.services"), value: String(stats.activeServices) },
    { label: t("beauty.professionals"), value: String(stats.activeProfessionals) },
    { label: t("beauty.profileViews"), value: String(stats.profileViews) },
    {
      label: t("beauty.reviews"),
      value: stats.ratingCount ? `${stats.avgRating.toFixed(1)} (${stats.ratingCount})` : "—",
    },
  ];

  return (
    <div>
      <CenterNav businessId={id} />
      <div className="mb-4">
        <h2 className="text-lg font-extrabold">{business.name}</h2>
        <p className="text-xs text-muted-foreground">{business.status}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-lg font-black text-[hsl(350,25%,18%)]">{c.value}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/beauty/${id}`}
        className="mt-4 inline-flex text-sm font-semibold text-[hsl(350,45%,40%)]"
      >
        Public profile →
      </Link>
    </div>
  );
}
