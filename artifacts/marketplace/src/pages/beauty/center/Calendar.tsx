import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  fetchBeautyCenterCalendar,
  updateBeautyAppointmentStatus,
  type BeautyAppointment,
} from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

export default function BeautyCenterCalendar() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Calendar">
        <Body id={Number(businessId)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  function range() {
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date();
    to.setDate(to.getDate() + 14);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  function load() {
    setLoading(true);
    const { from, to } = range();
    fetchBeautyCenterCalendar(id, { from, to })
      .then((d) => setAppointments(d.appointments ?? []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function confirm(apptId: number) {
    await updateBeautyAppointmentStatus(apptId, { status: "confirmed" });
    load();
  }

  return (
    <div>
      <CenterNav businessId={id} />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : appointments.length === 0 ? (
        <BeautyEmpty title={t("beauty.emptyAppointmentsTitle")} body={t("beauty.emptyAppointmentsBody")} />
      ) : (
        <div className="space-y-2">
          {appointments.map((a) => (
            <div key={a.id} className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{a.serviceNameSnapshot}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.startsAt).toLocaleString()} · {a.customerName || "—"}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">{a.status}</span>
              </div>
              {a.status === "pending_confirmation" && (
                <button
                  type="button"
                  onClick={() => void confirm(a.id)}
                  className="mt-2 rounded-lg bg-[hsl(350,40%,95%)] px-2.5 py-1.5 text-xs font-semibold text-[hsl(350,45%,35%)]"
                >
                  {t("beauty.statusConfirmed")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
