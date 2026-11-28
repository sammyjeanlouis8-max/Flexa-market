import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyNotice, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  createBeautyBusiness,
  createBeautyProfessional,
  createBeautyService,
  fetchMyBeautyBusinesses,
  updateBeautyHours,
  updateMyBeautyBusiness,
  type BeautyBusiness,
} from "@/lib/beautyApi";
import { BEAUTY_PRIMARY_CATEGORIES } from "@/lib/beautyCategoriesCatalog";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "seduire_beauty_onboarding_draft";
const TOTAL_STEPS = 6;

type Draft = {
  businessId?: number;
  step: number;
  name: string;
  businessType: string;
  description: string;
  phone: string;
  whatsapp: string;
  email: string;
  country: string;
  region: string;
  city: string;
  streetAddress: string;
  showPublicAddress: boolean;
  homeServiceAvailable: boolean;
  categorySlugs: string[];
  termsAccepted: boolean;
  serviceName: string;
  servicePrice: string;
  serviceDuration: string;
  staffName: string;
};

const emptyDraft = (country = ""): Draft => ({
  step: 1,
  name: "",
  businessType: "beauty_studio",
  description: "",
  phone: "",
  whatsapp: "",
  email: "",
  country,
  region: "",
  city: "",
  streetAddress: "",
  showPublicAddress: true,
  homeServiceAvailable: false,
  categorySlugs: ["beauty-studio"],
  termsAccepted: false,
  serviceName: "",
  servicePrice: "",
  serviceDuration: "60",
  staffName: "",
});

export default function BeautyOnboarding() {
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell
        title="Register"
        subtitle="6-step setup"
      >
        <OnboardingBody />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function OnboardingBody() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) return { ...emptyDraft(user?.country || ""), ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return emptyDraft(user?.country || "");
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<BeautyBusiness[]>([]);

  useEffect(() => {
    fetchMyBeautyBusinesses()
      .then(setExisting)
      .catch(() => setExisting([]));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft]);

  function patch(partial: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  async function saveDraftRemote() {
    setSaving(true);
    setError(null);
    try {
      let businessId = draft.businessId;
      if (!businessId) {
        if (draft.name.trim().length < 2 || !draft.country || !draft.city) {
          throw new Error(t("beauty.completeRequiredFields", { defaultValue: "Please complete required fields." }));
        }
        const offersMobile =
          draft.homeServiceAvailable
          || draft.categorySlugs.includes("mobile-beauty")
          || draft.businessType.startsWith("mobile_");
        const created = await createBeautyBusiness({
          name: draft.name.trim(),
          businessType: draft.businessType,
          description: draft.description,
          phone: draft.phone || null,
          whatsapp: draft.whatsapp || null,
          email: draft.email || null,
          country: draft.country,
          region: draft.region || null,
          city: draft.city,
          streetAddress: draft.streetAddress,
          showPublicAddress: draft.showPublicAddress,
          homeServiceAvailable: offersMobile,
          serviceLocationMode: offersMobile ? "both" : "at_business",
          categorySlugs: draft.categorySlugs,
          onboardingStep: draft.step,
          termsAccepted: draft.termsAccepted,
        });
        businessId = created.id;
        patch({ businessId });
      } else {
        const offersMobile =
          draft.homeServiceAvailable
          || draft.categorySlugs.includes("mobile-beauty")
          || draft.businessType.startsWith("mobile_");
        await updateMyBeautyBusiness(businessId, {
          name: draft.name.trim(),
          businessType: draft.businessType,
          description: draft.description,
          phone: draft.phone || null,
          whatsapp: draft.whatsapp || null,
          email: draft.email || null,
          country: draft.country,
          region: draft.region || null,
          city: draft.city,
          streetAddress: draft.streetAddress,
          showPublicAddress: draft.showPublicAddress,
          homeServiceAvailable: offersMobile,
          serviceLocationMode: offersMobile ? "both" : "at_business",
          categorySlugs: draft.categorySlugs,
          onboardingStep: draft.step,
          termsAccepted: draft.termsAccepted,
        });
      }
      setMessage(t("beauty.draftSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("beauty.loadError"));
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    setError(null);
    if (draft.step === 1) {
      if (draft.name.trim().length < 2) {
        setError(t("beauty.fieldRequired"));
        return;
      }
    }
    if (draft.step === 2) {
      if (!draft.country || !draft.city) {
        setError(t("beauty.fieldRequired"));
        return;
      }
    }
    await saveDraftRemote();
    if (draft.step < TOTAL_STEPS) patch({ step: draft.step + 1 });
  }

  async function submitForReview() {
    if (!draft.termsAccepted) {
      setError(t("beauty.fieldRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveDraftRemote();
      let businessId = draft.businessId;
      if (!businessId) throw new Error(t("beauty.fieldRequired"));

      if (draft.step >= 3 && businessId) {
        await updateBeautyHours(businessId, Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          isClosed: weekday === 0,
          openTime: "09:00",
          closeTime: "18:00",
        })));
      }
      if (draft.serviceName.trim() && businessId) {
        const price = Number(draft.servicePrice) || 0;
        await createBeautyService(businessId, {
          name: draft.serviceName.trim(),
          priceMinor: Math.round(price * 100),
          durationMinutes: Number(draft.serviceDuration) || 60,
          currency: "USD",
          serviceLocation: draft.homeServiceAvailable ? "both" : "at_business",
        });
      }
      if (draft.staffName.trim() && businessId) {
        await createBeautyProfessional(businessId, {
          fullName: draft.staffName.trim(),
          role: "stylist",
        });
      }

      await updateMyBeautyBusiness(businessId, {
        submit: true,
        onboardingStep: TOTAL_STEPS,
        termsAccepted: true,
        phone: draft.phone || undefined,
        name: draft.name.trim(),
        city: draft.city,
        country: draft.country,
      });
      localStorage.removeItem(DRAFT_KEY);
      window.location.assign(`/beauty/center/${businessId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("beauty.loadError"));
    } finally {
      setSaving(false);
    }
  }

  const stepTitles = [
    t("beauty.stepBasics"),
    t("beauty.stepLocation"),
    t("beauty.stepHours"),
    t("beauty.stepServices"),
    t("beauty.stepStaff"),
    t("beauty.stepReview"),
  ];

  return (
    <div className="space-y-4">
      <BeautyNotice>{t("beauty.privacyNotice")}</BeautyNotice>

      {existing.length > 0 && (
        <div className="rounded-xl border border-[hsl(350,20%,88%)] bg-white p-3 text-sm">
          <p className="font-semibold">{t("beauty.centerTitle")}</p>
          <ul className="mt-2 space-y-1">
            {existing.map((b) => (
              <li key={b.id}>
                <Link href={`/beauty/center/${b.id}`} className="text-[hsl(350,45%,40%)] font-semibold">
                  {b.name} · {b.status}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-[hsl(350,30%,40%)]">
          {t("beauty.stepOf", { current: draft.step, total: TOTAL_STEPS })} · {stepTitles[draft.step - 1]}
        </p>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < draft.step ? "bg-[hsl(350,45%,42%)]" : "bg-[hsl(350,20%,88%)]",
              )}
            />
          ))}
        </div>
      </div>

      {draft.step === 1 && (
        <div className="space-y-3">
          <Field label={t("beauty.businessName")} value={draft.name} onChange={(v) => patch({ name: v })} required />
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">{t("beauty.businessType")}</span>
            <select
              value={draft.businessType}
              onChange={(e) => patch({ businessType: e.target.value })}
              className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
            >
              <option value="beauty_studio">{t("beauty.catBeautyStudio")}</option>
              <option value="barbershop">{t("beauty.catBarbershop")}</option>
              <option value="independent_beauty">{t("beauty.catIndependent")}</option>
              <option value="independent_barber">{t("beauty.catIndependentBarber", { defaultValue: "Independent Barber" })}</option>
              <option value="mobile_beauty">{t("beauty.catMobileBeauty", { defaultValue: "Mobile Beauty" })}</option>
              <option value="mobile_barber">{t("beauty.catMobileBarber", { defaultValue: "Mobile Barber" })}</option>
            </select>
          </label>
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              {t("beauty.categoriesSelect", { defaultValue: "Categories (select all that apply)" })}
            </p>
            <div className="flex flex-wrap gap-2">
              {BEAUTY_PRIMARY_CATEGORIES.map((cat) => {
                const active = draft.categorySlugs.includes(cat.slug);
                return (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? draft.categorySlugs.filter((s) => s !== cat.slug)
                        : [...draft.categorySlugs, cat.slug];
                      patch({
                        categorySlugs: next.length ? next.slice(0, 12) : draft.categorySlugs,
                        homeServiceAvailable:
                          cat.slug === "mobile-beauty" && !active
                            ? true
                            : draft.homeServiceAvailable,
                      });
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-bold",
                      active
                        ? "border-[hsl(350,45%,38%)] bg-[hsl(350,45%,38%)] text-white"
                        : "border-[hsl(350,20%,88%)] bg-white text-[hsl(350,20%,20%)]",
                    )}
                  >
                    {t(cat.labelKey, { defaultValue: cat.slug })}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label={t("beauty.description")} value={draft.description} onChange={(v) => patch({ description: v })} multiline />
          <Field label={t("beauty.phone")} value={draft.phone} onChange={(v) => patch({ phone: v })} />
          <Field label={t("beauty.whatsapp")} value={draft.whatsapp} onChange={(v) => patch({ whatsapp: v })} />
          <Field label={t("beauty.email")} value={draft.email} onChange={(v) => patch({ email: v })} />
        </div>
      )}

      {draft.step === 2 && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">{t("beauty.country")} *</span>
            <select
              value={draft.country}
              onChange={(e) => patch({ country: e.target.value })}
              className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
            >
              <option value="">—</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <Field label={t("beauty.city")} value={draft.city} onChange={(v) => patch({ city: v })} required />
          <Field label={t("beauty.region")} value={draft.region} onChange={(v) => patch({ region: v })} />
          <Field label={t("beauty.streetAddress")} value={draft.streetAddress} onChange={(v) => patch({ streetAddress: v })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.showPublicAddress}
              onChange={(e) => patch({ showPublicAddress: e.target.checked })}
            />
            {t("beauty.showPublicAddress")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.homeServiceAvailable}
              onChange={(e) => patch({ homeServiceAvailable: e.target.checked })}
            />
            {t("beauty.homeServiceAvailable")}
          </label>
        </div>
      )}

      {draft.step === 3 && (
        <div className="rounded-xl border border-[hsl(350,20%,88%)] bg-white p-4 text-sm text-muted-foreground">
          {t("beauty.stepHoursBody")}
          <p className="mt-2 font-medium text-foreground">Default: Mon–Sat 09:00–18:00 · Sun closed</p>
          <p className="mt-1 text-xs">{t("beauty.centerSettings")} — editable after submit.</p>
        </div>
      )}

      {draft.step === 4 && (
        <div className="space-y-3">
          <Field label={t("beauty.services")} value={draft.serviceName} onChange={(v) => patch({ serviceName: v })} />
          <Field label="Price (USD)" value={draft.servicePrice} onChange={(v) => patch({ servicePrice: v })} />
          <Field label={t("beauty.durationMin", { min: "…" })} value={draft.serviceDuration} onChange={(v) => patch({ serviceDuration: v })} />
        </div>
      )}

      {draft.step === 5 && (
        <div className="space-y-3">
          <Field label={t("beauty.professionals")} value={draft.staffName} onChange={(v) => patch({ staffName: v })} />
          <p className="text-xs text-muted-foreground">{t("beauty.stepStaffBody")}</p>
        </div>
      )}

      {draft.step === 6 && (
        <div className="space-y-3 rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-4 text-sm">
          <p><strong>{draft.name}</strong> · {draft.businessType}</p>
          <p className="text-muted-foreground">{[draft.city, draft.country].filter(Boolean).join(", ")}</p>
          <p className="text-muted-foreground">{draft.description}</p>
          <label className="flex items-start gap-2 pt-2">
            <input
              type="checkbox"
              checked={draft.termsAccepted}
              onChange={(e) => patch({ termsAccepted: e.target.checked })}
              className="mt-0.5"
            />
            <span>{t("beauty.termsAccept")}</span>
          </label>
        </div>
      )}

      {message && <p className="text-xs font-semibold text-[hsl(350,45%,35%)]">{message}</p>}
      {error && <p className="text-xs font-semibold text-[hsl(0,55%,40%)]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {draft.step > 1 && (
          <button
            type="button"
            onClick={() => patch({ step: draft.step - 1 })}
            className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-4 py-3 text-sm font-bold"
          >
            {t("beauty.back")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void saveDraftRemote()}
          disabled={saving}
          className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-4 py-3 text-sm font-bold"
        >
          {t("beauty.saveDraft")}
        </button>
        {draft.step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={saving}
            className="flex-1 rounded-xl bg-[hsl(350,45%,38%)] px-4 py-3 text-sm font-extrabold text-white"
          >
            {t("beauty.continue")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submitForReview()}
            disabled={saving}
            className="flex-1 rounded-xl bg-[hsl(350,45%,38%)] px-4 py-3 text-sm font-extrabold text-white"
          >
            {t("beauty.submitForReview")}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-semibold">
        {label}
        {required ? " *" : ""}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
          rows={3}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
        />
      )}
    </label>
  );
}
