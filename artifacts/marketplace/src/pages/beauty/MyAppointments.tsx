import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  cancelBeautyAppointment,
  fetchMyBeautyAppointments,
  formatBeautyPrice,
  type BeautyAppointment,
} from "@/lib/beautyApi";
import { cn } from "@/lib/utils";

export default function BeautyMyAppointments() {
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell
        title="My appointments"
      >
        <Body />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BeautyAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetchMyBeautyAppointments()
      .then((list) => {
        setRows(list);
        setError(false);
      })
      .catch(() => {
        setRows([]);
        setError(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function onCancel(id: number) {
    if (!window.confirm(t("beauty.cancelAppointment"))) return;
    setBusy(id);
    try {
      await cancelBeautyAppointment(id);
      load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>;
  if (error) return <BeautyEmpty title={t("beauty.loadError")} body="" />;
  if (rows.length === 0) {
    return (
      <BeautyEmpty
        title={t("beauty.emptyAppointmentsTitle")}
        body={t("beauty.emptyAppointmentsBody")}
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
      <p className="text-sm text-muted-foreground">{t("beauty.myAppointmentsSubtitle")}</p>
      {rows.map((a) => {
        const cancellable = !["cancelled", "completed", "no_show"].includes(a.status);
        return (
          <article
            key={a.id}
            className="rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold">{a.serviceNameSnapshot}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(a.startsAt).toLocaleString()}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                  a.status === "confirmed" || a.status === "completed"
                    ? "bg-[hsl(350,40%,94%)] text-[hsl(350,45%,35%)]"
                    : "bg-neutral-100 text-neutral-600",
                )}
              >
                {a.status}
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[hsl(350,45%,35%)]">
              {formatBeautyPrice(a.total, a.currency)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/beauty/booking/${a.id}`}
                className="rounded-lg border border-[hsl(350,20%,88%)] px-2.5 py-1.5 text-xs font-semibold"
              >
                Details
              </Link>
              {cancellable && (
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => void onCancel(a.id)}
                  className="rounded-lg border border-[hsl(0,40%,80%)] px-2.5 py-1.5 text-xs font-semibold text-[hsl(0,50%,40%)]"
                >
                  {t("beauty.cancelAppointment")}
                </button>
              )}
              {a.status === "completed" && (
                <Link
                  href={`/beauty/booking/${a.id}?review=1`}
                  className="rounded-lg bg-[hsl(350,40%,95%)] px-2.5 py-1.5 text-xs font-semibold text-[hsl(350,45%,35%)]"
                >
                  {t("beauty.leaveReview")}
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
