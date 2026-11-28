import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  createBeautyAppointment,
  fetchBeautyAvailability,
  fetchBeautyBusiness,
  formatBeautyPrice,
  payBeautyAppointment,
  type BeautyBusiness,
  type BeautyProfessional,
  type BeautyService,
  type BeautySlot,
} from "@/lib/beautyApi";
import { cn } from "@/lib/utils";

const STEPS = [
  "service",
  "professional",
  "location",
  "date",
  "time",
  "info",
  "review",
  "pay",
] as const;

type Step = (typeof STEPS)[number];

export default function BeautyBook() {
  const { id } = useParams<{ id: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Book">
        <BookBody businessId={Number(id)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function BookBody({ businessId }: { businessId: number }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const search = useSearch();
  const qs = useMemo(
    () => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
    [search],
  );

  const [biz, setBiz] = useState<BeautyBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<number | null>(
    qs.get("serviceId") ? Number(qs.get("serviceId")) : null,
  );
  const [professionalId, setProfessionalId] = useState<number | null>(
    qs.get("professionalId") ? Number(qs.get("professionalId")) : null,
  );
  const [serviceLocation, setServiceLocation] = useState<"at_business" | "at_customer">("at_business");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<BeautySlot | null>(null);
  const [slots, setSlots] = useState<BeautySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [customerName, setCustomerName] = useState((user as { name?: string } | null)?.name || "");
  const [customerPhone, setCustomerPhone] = useState((user as { phone?: string } | null)?.phone || "");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [paymentMode, setPaymentMode] = useState<"full" | "deposit" | "pay_at_location">("pay_at_location");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(businessId)) return;
    let cancelled = false;
    setLoading(true);
    fetchBeautyBusiness(businessId)
      .then((b) => {
        if (cancelled) return;
        setBiz(b);
        if (serviceId == null && (b.services?.length ?? 0) === 1) {
          setServiceId(b.services![0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setBiz(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, serviceId]);

  const services: BeautyService[] = biz?.services ?? [];
  const professionals: BeautyProfessional[] = biz?.professionals ?? [];
  const selectedService = services.find((s) => s.id === serviceId) || null;
  const selectedPro = professionals.find((p) => p.id === professionalId) || null;

  useEffect(() => {
    if (!selectedService || !date || !biz) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSlot(null);
    fetchBeautyAvailability({
      businessId: biz.id,
      serviceId: selectedService.id,
      date,
      professionalId,
      serviceLocation,
    })
      .then((res) => {
        if (!cancelled) setSlots(res.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [biz, selectedService, date, professionalId, serviceLocation]);

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }
  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  async function submitBooking() {
    if (!biz || !selectedService || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createBeautyAppointment({
        businessId: biz.id,
        serviceId: selectedService.id,
        professionalId,
        serviceLocation,
        startsAt: slot.startsAt,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        customerNotes,
        customerAddress: serviceLocation === "at_customer" ? customerAddress : null,
        paymentMode,
      });
      if (paymentMode !== "pay_at_location" && result.appointment?.id) {
        try {
          await payBeautyAppointment(result.appointment.id, { mode: paymentMode });
        } catch {
          /* payment may be handled externally */
        }
      }
      setDoneId(result.appointment.id);
      window.location.assign(`/beauty/booking/${result.appointment.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("beauty.loadError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>;
  if (!biz) return <BeautyEmpty title={t("beauty.loadError")} body={t("beauty.emptyBody")} />;
  if (doneId) {
    return (
      <BeautyEmpty
        title={t("beauty.bookingConfirmed")}
        body={t("beauty.bookingConfirmationBody")}
        action={
          <Link href={`/beauty/booking/${doneId}`} className="text-sm font-semibold text-[hsl(350,45%,40%)]">
            {t("beauty.viewAppointments")}
          </Link>
        }
      />
    );
  }

  const stepKeys: Record<Step, string> = {
    service: "beauty.stepService",
    professional: "beauty.stepProfessional",
    location: "beauty.stepLocation",
    date: "beauty.stepDate",
    time: "beauty.stepTime",
    info: "beauty.stepInfo",
    review: "beauty.stepReview",
    pay: "beauty.stepPay",
  };
  const stepLabel = t(stepKeys[step], { defaultValue: step });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <p className="font-semibold text-[hsl(350,30%,35%)]">
          {t("beauty.stepOf", { current: STEPS.indexOf(step) + 1, total: STEPS.length })} · {stepLabel}
        </p>
        <p className="truncate text-muted-foreground">{biz.name}</p>
      </div>

      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= STEPS.indexOf(step) ? "bg-[hsl(350,45%,42%)]" : "bg-[hsl(350,20%,88%)]",
            )}
          />
        ))}
      </div>

      {step === "service" && (
        <div className="space-y-2">
          {services.length === 0 ? (
            <BeautyEmpty title={t("beauty.emptyServicesTitle")} body="" />
          ) : (
            services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setServiceId(s.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left",
                  serviceId === s.id
                    ? "border-[hsl(350,45%,55%)] bg-[hsl(350,40%,96%)]"
                    : "border-[hsl(350,20%,88%)] bg-white",
                )}
              >
                <div>
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("beauty.durationMin", { min: s.durationMinutes })}
                  </p>
                </div>
                <span className="text-sm font-extrabold">{formatBeautyPrice(s.price, s.currency)}</span>
              </button>
            ))
          )}
        </div>
      )}

      {step === "professional" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setProfessionalId(null)}
            className={cn(
              "w-full rounded-xl border px-3 py-3 text-left text-sm font-bold",
              professionalId == null
                ? "border-[hsl(350,45%,55%)] bg-[hsl(350,40%,96%)]"
                : "border-[hsl(350,20%,88%)] bg-white",
            )}
          >
            {t("beauty.anyProfessional")}
          </button>
          {professionals.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfessionalId(p.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left",
                professionalId === p.id
                  ? "border-[hsl(350,45%,55%)] bg-[hsl(350,40%,96%)]"
                  : "border-[hsl(350,20%,88%)] bg-white",
              )}
            >
              <div className="h-10 w-10 overflow-hidden rounded-full bg-[hsl(350,30%,94%)]">
                {p.photoUrl ? <img src={p.photoUrl} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div>
                <p className="text-sm font-bold">{p.fullName}</p>
                <p className="text-xs text-muted-foreground">{p.role}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === "location" && (
        <div className="space-y-2">
          {(["at_business", "at_customer"] as const).map((loc) => {
            const allowed =
              !selectedService
              || selectedService.serviceLocation === "both"
              || selectedService.serviceLocation === loc
              || (loc === "at_customer" && biz.homeServiceAvailable);
            if (!allowed && loc === "at_customer") return null;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => setServiceLocation(loc)}
                className={cn(
                  "w-full rounded-xl border px-3 py-3 text-left text-sm font-bold",
                  serviceLocation === loc
                    ? "border-[hsl(350,45%,55%)] bg-[hsl(350,40%,96%)]"
                    : "border-[hsl(350,20%,88%)] bg-white",
                )}
              >
                {loc === "at_business" ? t("beauty.atBusiness") : t("beauty.atCustomer")}
              </button>
            );
          })}
        </div>
      )}

      {step === "date" && (
        <label className="block space-y-2">
          <span className="text-sm font-semibold">{t("beauty.selectDate")}</span>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3 text-sm"
          />
        </label>
      )}

      {step === "time" && (
        <div className="space-y-2">
          {slotsLoading ? (
            <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
          ) : slots.length === 0 ? (
            <BeautyEmpty title={t("beauty.noSlots")} body="" />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => {
                const label = new Date(s.startsAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const active = slot?.startsAt === s.startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={cn(
                      "rounded-xl border px-2 py-2.5 text-xs font-bold",
                      active
                        ? "border-[hsl(350,45%,55%)] bg-[hsl(350,40%,96%)]"
                        : "border-[hsl(350,20%,88%)] bg-white",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === "info" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">{t("beauty.yourName")}</span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">{t("beauty.yourPhone")}</span>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
            />
          </label>
          {serviceLocation === "at_customer" && (
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">{t("beauty.customerAddress")}</span>
              <textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
                rows={2}
              />
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">{t("beauty.notes")}</span>
            <textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
              rows={2}
            />
          </label>
        </div>
      )}

      {step === "review" && selectedService && slot && (
        <div className="space-y-2 rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-4 text-sm">
          <p><span className="text-muted-foreground">{t("beauty.services")}:</span> <strong>{selectedService.name}</strong></p>
          <p><span className="text-muted-foreground">{t("beauty.professionals")}:</span> <strong>{selectedPro?.fullName || t("beauty.anyProfessional")}</strong></p>
          <p><span className="text-muted-foreground">{t("beauty.stepLocation")}:</span> <strong>{serviceLocation === "at_business" ? t("beauty.atBusiness") : t("beauty.atCustomer")}</strong></p>
          <p><span className="text-muted-foreground">{t("beauty.stepDate")}:</span> <strong>{new Date(slot.startsAt).toLocaleString()}</strong></p>
          <p className="text-lg font-black text-[hsl(350,45%,35%)]">
            {formatBeautyPrice(selectedService.price, selectedService.currency)}
          </p>
        </div>
      )}

      {step === "pay" && (
        <div className="space-y-2">
          {(["pay_at_location", "deposit", "full"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaymentMode(mode)}
              className={cn(
                "w-full rounded-xl border px-3 py-3 text-left text-sm font-bold",
                paymentMode === mode
                  ? "border-[hsl(350,45%,55%)] bg-[hsl(350,40%,96%)]"
                  : "border-[hsl(350,20%,88%)] bg-white",
              )}
            >
              {mode === "pay_at_location"
                ? t("beauty.payAtLocation")
                : mode === "deposit"
                  ? t("beauty.payDeposit")
                  : t("beauty.payFull")}
            </button>
          ))}
          {error && <p className="text-sm font-semibold text-[hsl(0,55%,40%)]">{error}</p>}
        </div>
      )}

      <div className="flex gap-2">
        {STEPS.indexOf(step) > 0 && (
          <button
            type="button"
            onClick={back}
            className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-4 py-3 text-sm font-bold"
          >
            {t("beauty.back")}
          </button>
        )}
        {step !== "pay" ? (
          <button
            type="button"
            onClick={next}
            disabled={
              (step === "service" && !serviceId)
              || (step === "date" && !date)
              || (step === "time" && !slot)
              || (step === "info" && serviceLocation === "at_customer" && !customerAddress.trim())
            }
            className="flex-1 rounded-xl bg-[hsl(350,45%,38%)] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {t("beauty.continue")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submitBooking()}
            disabled={submitting}
            className="flex-1 rounded-xl bg-[hsl(350,45%,38%)] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {submitting ? t("beauty.loading") : t("beauty.confirmBooking")}
          </button>
        )}
      </div>
    </div>
  );
}
