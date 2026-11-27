import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { createRestaurant, uploadRestaurantFoodImage } from "@/lib/restaurantApi";
import { useAuth } from "@/contexts/auth";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { isRestaurantCountryHardDisabled, restaurantRegistrationCountries } from "@/lib/restaurantCountryPolicy";

const REGISTRATION_COUNTRIES = restaurantRegistrationCountries(SUPPORTED_COUNTRIES);

const STEPS = ["basics", "hours", "identity", "safety", "publish"] as const;

const PRIMARY_TYPES = [
  { id: "traditional", labelKey: "restaurant.catRestaurants", fallback: "Restaurants" },
  { id: "food_truck", labelKey: "restaurant.catFoodTruck", fallback: "Food Trucks" },
  { id: "home_kitchen", labelKey: "restaurant.catHomeKitchen", fallback: "Home Kitchens" },
] as const;

const DRAFT_KEY = "flexa_restaurant_registration_draft_v1";

type FormState = {
  name: string;
  businessType: string;
  description: string;
  country: string;
  region: string;
  city: string;
  streetAddress: string;
  cuisineTags: string;
  phone: string;
  logoUrl: string;
  coverUrl: string;
  fulfillment: string;
  openTime: string;
  closeTime: string;
  reuseKyc: boolean;
  identityAck: boolean;
  foodResponsibilityAck: boolean;
  termsAck: boolean;
};

function emptyForm(countryDefault: string): FormState {
  return {
    name: "",
    businessType: "traditional",
    description: "",
    country: countryDefault,
    region: "",
    city: "",
    streetAddress: "",
    cuisineTags: "",
    phone: "",
    logoUrl: "",
    coverUrl: "",
    fulfillment: "pickup",
    openTime: "08:00",
    closeTime: "20:00",
    reuseKyc: true,
    identityAck: false,
    foodResponsibilityAck: false,
    termsAck: false,
  };
}

export default function AddRestaurant() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const countryDefault =
    user?.country && !isRestaurantCountryHardDisabled(user.country) ? user.country : "Haiti";

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attemptedNext, setAttemptedNext] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(countryDefault));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<FormState> & { step?: number };
      setForm((prev) => ({ ...prev, ...parsed, country: parsed.country || prev.country }));
      if (typeof parsed.step === "number") setStep(Math.min(STEPS.length - 1, Math.max(0, parsed.step)));
    } catch {
      /* ignore corrupt draft */
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, step }));
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form, step]);

  const stepMeta = useMemo(
    () => [
      { title: t("restaurant.stepBasics", { defaultValue: "Basics" }), body: t("restaurant.stepBasicsBody", { defaultValue: "Business identity, location, and category." }) },
      { title: t("restaurant.stepHours", { defaultValue: "Hours" }), body: t("restaurant.stepHoursBody", { defaultValue: "Opening hours and fulfillment (owner-managed delivery)." }) },
      { title: t("restaurant.stepIdentity", { defaultValue: "Identity" }), body: t("restaurant.stepIdentityBody", { defaultValue: "Verify identity before publishing." }) },
      { title: t("restaurant.stepSafety", { defaultValue: "Food safety" }), body: t("restaurant.stepSafetyBody", { defaultValue: "Food safety acknowledgment and training." }) },
      { title: t("restaurant.stepPublish", { defaultValue: "Review" }), body: t("restaurant.stepPublishBody", { defaultValue: "Review and submit for administrative approval. Publishing requires verification." }) },
    ],
    [t],
  );

  function markTouched(key: string) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function basicsErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.businessType) e.businessType = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.cuisineTags.trim()) e.cuisineTags = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.country.trim()) e.country = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.region.trim()) e.region = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.city.trim()) e.city = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.streetAddress.trim()) e.streetAddress = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.description.trim()) e.description = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.phone.trim()) e.phone = t("restaurant.fieldRequired", { defaultValue: "Required" });
    return e;
  }

  function canAdvance(): boolean {
    if (step === 0) return Object.keys(basicsErrors()).length === 0;
    if (step === 1) return !!form.fulfillment && !!form.openTime && !!form.closeTime;
    if (step === 2) return form.identityAck && (form.reuseKyc || true);
    if (step === 3) return form.foodResponsibilityAck && form.termsAck;
    return true;
  }

  function goNext() {
    setAttemptedNext(true);
    if (!canAdvance()) {
      setError(t("restaurant.completeRequiredFields", { defaultValue: "Please complete the required fields before continuing." }));
      return;
    }
    setError(null);
    setAttemptedNext(false);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function onUpload(kind: "logo" | "cover", file: File | null) {
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const url = await uploadRestaurantFoodImage(file);
      setForm((f) => ({ ...f, [kind === "logo" ? "logoUrl" : "coverUrl"]: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function onCreateDraft() {
    setAttemptedNext(true);
    if (!canAdvance()) {
      setError(t("restaurant.completeRequiredFields", { defaultValue: "Please complete the required fields before continuing." }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
      const r = await createRestaurant({
        name: form.name.trim(),
        businessType: form.businessType,
        description: form.description.trim(),
        country: form.country,
        region: form.region.trim(),
        city: form.city.trim(),
        streetAddress: form.streetAddress.trim(),
        cuisineTags: form.cuisineTags.split(",").map((s) => s.trim()).filter(Boolean),
        phone: form.phone.trim(),
        logoUrl: form.logoUrl || undefined,
        coverUrl: form.coverUrl || undefined,
        fulfillment: form.fulfillment,
      });
      const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isClosed: false,
        openTime: form.openTime,
        closeTime: form.closeTime,
        overnight: false,
      }));
      await fetch(`/api/restaurants/${r.id}/hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ hours }),
      });
      await fetch(`/api/restaurants/${r.id}/delivery`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          fulfillment: form.fulfillment,
          ownerManagedDelivery: true,
          usesFlexaDrivers: false,
          deliveryFee: 0,
          deliveryInstructions: "Delivery is managed directly by this business.",
        }),
      });
      if (form.reuseKyc) {
        await fetch(`/api/restaurants/${r.id}/identity`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ reuseMarketKyc: true }),
        }).catch(() => undefined);
      }
      localStorage.removeItem(DRAFT_KEY);
      setLocation(`/restaurant/owner?rid=${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const showBasicsErrors = attemptedNext && step === 0;
  const bErr = basicsErrors();

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.addRestaurantTitle")} subtitle={t("restaurant.addRestaurantSubtitle")}>
        <div className="mb-4 space-y-2">
          <RestaurantNotice>{t("restaurant.freeLaunchNote")}</RestaurantNotice>
          <RestaurantNotice>
            {t("restaurant.deliveryManagedByBusiness", {
              defaultValue: "Delivery is managed directly by this business.",
            })}
          </RestaurantNotice>
        </div>

        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" data-testid="restaurant-reg-steps">
          {stepMeta.map((s, i) => (
            <button
              key={STEPS[i]}
              type="button"
              onClick={() => setStep(i)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                i === step ? "bg-[hsl(152,55%,28%)] text-white" : "bg-muted text-foreground"
              }`}
            >
              {i + 1}. {s.title}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">{stepMeta[step]?.body}</p>

        {step === 0 && (
          <BasicsFormFields
            form={form}
            setForm={setForm}
            t={t}
            errors={showBasicsErrors ? bErr : {}}
            markTouched={markTouched}
            touched={touched}
            onUpload={onUpload}
            uploading={uploading}
          />
        )}

        {step === 1 && (
          <div className="mt-4 space-y-3">
            <RestaurantNotice>
              {t("restaurant.driverPolicyNote", {
                defaultValue: "Flexa Driver never transports Flexa Restaurant food orders.",
              })}
            </RestaurantNotice>
            <label className="block text-sm font-semibold">
              {t("restaurant.fulfillment", { defaultValue: "Fulfillment" })}
              <select
                value={form.fulfillment}
                onChange={(e) => setForm((f) => ({ ...f, fulfillment: e.target.value }))}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="pickup">{t("restaurant.pickup")}</option>
                <option value="delivery">{t("restaurant.delivery")}</option>
                <option value="both">{t("restaurant.bothFulfillment", { defaultValue: "Pickup & delivery" })}</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-semibold">
                {t("restaurant.opens", { defaultValue: "Opens" })}
                <input
                  type="time"
                  value={form.openTime}
                  onChange={(e) => setForm((f) => ({ ...f, openTime: e.target.value }))}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-semibold">
                {t("restaurant.closes", { defaultValue: "Closes" })}
                <input
                  type="time"
                  value={form.closeTime}
                  onChange={(e) => setForm((f) => ({ ...f, closeTime: e.target.value }))}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm">{t("restaurant.identityPrivacyBody")}</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.reuseKyc}
                onChange={(e) => setForm((f) => ({ ...f, reuseKyc: e.target.checked }))}
              />
              <span>{t("restaurant.reuseMarketKyc", { defaultValue: "Reuse verified Flexa Market KYC when available" })}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.identityAck}
                onChange={(e) => setForm((f) => ({ ...f, identityAck: e.target.checked }))}
              />
              <span>{t("restaurant.identityAck", { defaultValue: "I understand identity documents stay private and publishing requires verification." })}</span>
            </label>
            <Link href="/restaurant/owner/identity" className="inline-block text-sm font-semibold text-[hsl(152,55%,28%)]">
              {t("restaurant.identityVerification")}
            </Link>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 space-y-3">
            <RestaurantNotice>{t("restaurant.foodResponsibilityAck")}</RestaurantNotice>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.foodResponsibilityAck}
                onChange={(e) => setForm((f) => ({ ...f, foodResponsibilityAck: e.target.checked }))}
              />
              <span>{t("restaurant.foodResponsibilityAck")}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.termsAck}
                onChange={(e) => setForm((f) => ({ ...f, termsAck: e.target.checked }))}
              />
              <span>{t("restaurant.acceptTerms", { defaultValue: "I accept the food safety terms" })}</span>
            </label>
            <Link href="/restaurant/owner/food-safety" className="inline-block text-sm font-semibold text-[hsl(152,55%,28%)]">
              {t("restaurant.foodSafetyQuiz")}
            </Link>
          </div>
        )}

        {step === 4 && (
          <div className="mt-4 space-y-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold">{form.name || "—"}</p>
            <p className="text-xs text-muted-foreground">
              {PRIMARY_TYPES.find((x) => x.id === form.businessType)?.fallback || form.businessType}
              {" · "}
              {form.city}, {form.region}, {form.country}
            </p>
            <p className="text-sm">{form.description}</p>
            <p className="text-xs text-muted-foreground">
              {form.phone} · {form.cuisineTags} · {form.fulfillment}
            </p>
            <RestaurantNotice>
              {t("restaurant.adminApprovalRequired", {
                defaultValue: "Application saves as a draft. Publishing requires identity, food safety, and Super Admin approval. Countries remain default-deny until regulatory approval.",
              })}
            </RestaurantNotice>
            <RestaurantNotice>
              {t("restaurant.driverPolicyNote", {
                defaultValue: "Flexa Driver never transports Flexa Restaurant food orders.",
              })}
            </RestaurantNotice>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step > 0 && (
            <button
              type="button"
              onClick={() => { setError(null); setAttemptedNext(false); setStep((s) => s - 1); }}
              className="rounded-full border px-4 py-2 text-sm font-semibold"
            >
              {t("common.back", { defaultValue: "Back" })}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white"
            >
              {t("common.next", { defaultValue: "Next" })}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onCreateDraft()}
              className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving
                ? t("common.saving", { defaultValue: "Saving…" })
                : t("restaurant.submitApplication", { defaultValue: "Submit application" })}
            </button>
          )}
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function BasicsFormFields({
  form,
  setForm,
  t,
  errors,
  markTouched,
  touched,
  onUpload,
  uploading,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  t: (k: string, o?: Record<string, unknown>) => string;
  errors: Record<string, string>;
  markTouched: (k: string) => void;
  touched: Record<string, boolean>;
  onUpload: (kind: "logo" | "cover", file: File | null) => void;
  uploading: "logo" | "cover" | null;
}) {
  const show = (key: string) => Boolean(errors[key] && (touched[key] || errors[key]));

  return (
    <div className="mt-4 space-y-3" data-testid="restaurant-basics-form">
      <label className="block text-sm font-semibold">
        {t("restaurant.businessCategory", { defaultValue: "Business category" })}
        <select
          value={form.businessType}
          onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
          onBlur={() => markTouched("businessType")}
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
        >
          {PRIMARY_TYPES.map((ty) => (
            <option key={ty.id} value={ty.id}>
              {t(ty.labelKey, { defaultValue: ty.fallback })}
            </option>
          ))}
        </select>
        {show("businessType") ? <span className="mt-1 block text-xs text-destructive">{errors.businessType}</span> : null}
      </label>

      <Field
        label={t("restaurant.businessName", { defaultValue: "Business name" })}
        value={form.name}
        error={show("name") ? errors.name : undefined}
        onBlur={() => markTouched("name")}
        onChange={(v) => setForm((f) => ({ ...f, name: v }))}
      />
      <Field
        label={t("restaurant.cuisine", { defaultValue: "Cuisine type" })}
        value={form.cuisineTags}
        placeholder={t("restaurant.cuisinePlaceholder", { defaultValue: "e.g. Haitian, Grill, Bakery" })}
        error={show("cuisineTags") ? errors.cuisineTags : undefined}
        onBlur={() => markTouched("cuisineTags")}
        onChange={(v) => setForm((f) => ({ ...f, cuisineTags: v }))}
      />
      <Field
        label={t("restaurant.description", { defaultValue: "Business description" })}
        value={form.description}
        multiline
        error={show("description") ? errors.description : undefined}
        onBlur={() => markTouched("description")}
        onChange={(v) => setForm((f) => ({ ...f, description: v }))}
      />

      <label className="block text-sm font-semibold">
        {t("restaurant.country", { defaultValue: "Country" })}
        <select
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          onBlur={() => markTouched("country")}
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
        >
          {REGISTRATION_COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {show("country") ? <span className="mt-1 block text-xs text-destructive">{errors.country}</span> : null}
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {t("restaurant.usCaDisabledNote", { defaultValue: "United States and Canada are disabled by regulatory policy." })}
        </span>
      </label>

      <Field
        label={t("restaurant.region", { defaultValue: "State / department / region" })}
        value={form.region}
        error={show("region") ? errors.region : undefined}
        onBlur={() => markTouched("region")}
        onChange={(v) => setForm((f) => ({ ...f, region: v }))}
      />
      <Field
        label={t("restaurant.city", { defaultValue: "City" })}
        value={form.city}
        error={show("city") ? errors.city : undefined}
        onBlur={() => markTouched("city")}
        onChange={(v) => setForm((f) => ({ ...f, city: v }))}
      />
      <Field
        label={t("restaurant.address", { defaultValue: "Business address" })}
        value={form.streetAddress}
        error={show("streetAddress") ? errors.streetAddress : undefined}
        onBlur={() => markTouched("streetAddress")}
        onChange={(v) => setForm((f) => ({ ...f, streetAddress: v }))}
      />
      <Field
        label={t("restaurant.phone", { defaultValue: "Phone number" })}
        value={form.phone}
        error={show("phone") ? errors.phone : undefined}
        onBlur={() => markTouched("phone")}
        onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
      />

      <ImageUploadField
        label={t("restaurant.businessLogo", { defaultValue: "Business logo" })}
        url={form.logoUrl}
        uploading={uploading === "logo"}
        onPick={(file) => onUpload("logo", file)}
      />
      <ImageUploadField
        label={t("restaurant.coverImage", { defaultValue: "Cover image" })}
        url={form.coverUrl}
        uploading={uploading === "cover"}
        onPick={(file) => onUpload("cover", file)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  error,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls = "mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm dark:bg-[hsl(152,16%,12%)]";
  return (
    <label className="block text-sm font-semibold">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} className={cls} rows={3} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} className={cls} />
      )}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function ImageUploadField({
  label,
  url,
  uploading,
  onPick,
}: {
  label: string;
  url: string;
  uploading: boolean;
  onPick: (file: File | null) => void;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        type="file"
        accept="image/*"
        className="mt-1 block w-full text-xs"
        disabled={uploading}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {uploading ? <span className="mt-1 block text-xs text-muted-foreground">Uploading…</span> : null}
      {url ? (
        <img src={url} alt="" className="mt-2 h-20 w-20 rounded-xl object-cover border" />
      ) : null}
    </label>
  );
}
