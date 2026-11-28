import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  fetchBeautyAppointment,
  formatBeautyPrice,
  type BeautyAppointment,
} from "@/lib/beautyApi";

export default function BeautyBookingConfirmation() {
  const { id } = useParams<{ id: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell>
        <Body id={Number(id)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [appt, setAppt] = useState<BeautyAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    setLoading(true);
    fetchBeautyAppointment(id)
      .then((a) => {
        if (!cancelled) {
          setAppt(a);
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
  if (error || !appt) {
    return <BeautyEmpty title={t("beauty.loadError")} body={t("beauty.emptyBody")} />;
  }

  const confirmed = !["pending_confirmation", "pending_payment"].includes(appt.status);

  return (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(350,45%,42%)]" />
      <h1 className="text-xl font-extrabold tracking-tight">
        {confirmed ? t("beauty.bookingConfirmed") : t("beauty.bookingPending")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("beauty.bookingConfirmationBody")}</p>

      <div className="rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-4 text-left text-sm space-y-2">
        <p><strong>{appt.serviceNameSnapshot}</strong></p>
        <p className="text-muted-foreground">{new Date(appt.startsAt).toLocaleString()}</p>
        <p className="font-extrabold text-[hsl(350,45%,35%)]">
          {formatBeautyPrice(appt.total, appt.currency)}
        </p>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{appt.status}</p>
      </div>

      <Link
        href="/beauty/my-appointments"
        className="inline-flex rounded-xl bg-[hsl(350,45%,38%)] px-4 py-2.5 text-sm font-bold text-white"
      >
        {t("beauty.viewAppointments")}
      </Link>
    </div>
  );
}
