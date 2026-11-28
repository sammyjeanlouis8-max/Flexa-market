import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import { fetchBeautyCenterRevenue, formatBeautyPrice } from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

export default function BeautyCenterRevenue() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Revenue">
        <Body id={Number(businessId)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    currency: string;
    total: number;
    series: Array<{ day: string; total: number; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBeautyCenterRevenue(id)
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

  return (
    <div>
      <CenterNav businessId={id} />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : error || !data ? (
        <BeautyEmpty title={t("beauty.loadError")} body="" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("beauty.revenue")}
            </p>
            <p className="mt-1 text-2xl font-black text-[hsl(350,45%,35%)]">
              {formatBeautyPrice(data.total, data.currency)}
            </p>
          </div>
          {data.series.length === 0 ? (
            <p className="text-sm text-muted-foreground">No revenue in this period.</p>
          ) : (
            <ul className="space-y-2">
              {data.series.map((row) => (
                <li
                  key={row.day}
                  className="flex items-center justify-between rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2.5 text-sm"
                >
                  <span className="font-medium">{row.day}</span>
                  <span className="text-muted-foreground">{row.count} appt</span>
                  <span className="font-bold">{formatBeautyPrice(row.total, data.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
