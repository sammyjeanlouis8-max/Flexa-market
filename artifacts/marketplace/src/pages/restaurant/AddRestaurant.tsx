import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  BUSINESS_TYPES,
  createRestaurant,
  updateRestaurant,
  uploadRestaurantFoodImage,
} from "@/lib/restaurantApi";
import { useAuth } from "@/contexts/auth";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { isRestaurantCountryHardDisabled, restaurantRegistrationCountries } from "@/lib/restaurantCountryPolicy";

const REGISTRATION_COUNTRIES = restaurantRegistrationCountries(SUPPORTED_COUNTRIES);

const STEPS = ["info", "location", "hours", "identity", "safety", "review"] as const;

const PRIMARY_TYPES = BUSINESS_TYPES.filter((t) => t.id !== "all");

const WEEKDAYS = [
  { id: 1, key: "monday", fallback: "Monday" },
  { id: 2, key: "tuesday", fallback: "Tuesday" },
  { id: 3, key: "wednesday", fallback: "Wednesday" },
  { id: 4, key: "thursday", fallback: "Thursday" },
  { id: 5, key: "friday", fallback: "Friday" },
  { id: 6, key: "saturday", fallback: "Saturday" },
  { id: 0, key: "sunday", fallback: "Sunday" },
] as const;

const DRAFT_KEY = "flexa_restaurant_registration_draft_v2";

type DayHours = {
  weekday: number;
  isClosed: boolean;
  open24h: boolean;
  overnight: boolean;
  openTime: string;
  closeTime: string;
};

type FormState = {
  restaurantId: number | null;
  name: string;
  businessType: string;
  description: string;
  cuisineTags: string;
  phone: string;
  email: string;
  logoUrl: string;
  coverUrl: string;
  country: string;
  region: string;
  city: string;
  streetAddress: string;
  publicPickupAddress: string;
  whatsapp: string;
  latitude: string;
  longitude: string;
  privateHomeAddress: boolean;
  fulfillment: string;
  dineIn: boolean;
  acceptsReservations: boolean;
  deliveryZones: string;
  deliveryFee: string;
  estimatedPrepMinutes: string;
  estimatedDeliveryMinutes: string;
  temporarilyClosed: boolean;
  dayHours: DayHours[];
  reuseKyc: boolean;
  identityAck: boolean;
  legalName: string;
  foodResponsibilityAck: boolean;
  termsAck: boolean;
  licenseNote: string;
};

function defaultDayHours(): DayHours[] {
  return WEEKDAYS.map((d) => ({
    weekday: d.id,
    isClosed: d.id === 0,
    open24h: false,
    overnight: false,
    openTime: "08:00",
    closeTime: "20:00",
  }));
}

function emptyForm(countryDefault: string): FormState {
  return {
    restaurantId: null,
    name: "",
    businessType: "traditional",
    description: "",
    cuisineTags: "",
    phone: "",
    email: "",
    logoUrl: "",
    coverUrl: "",
    country: countryDefault,
    region: "",
    city: "",
    streetAddress: "",
    publicPickupAddress: "",
    whatsapp: "",
    latitude: "",
    longitude: "",
    privateHomeAddress: true,
    fulfillment: "pickup",
    dineIn: false,
    acceptsReservations: false,
    deliveryZones: "",
    deliveryFee: "0",
    estimatedPrepMinutes: "30",
    estimatedDeliveryMinutes: "45",
    temporarilyClosed: false,
    dayHours: defaultDayHours(),
    reuseKyc: true,
    identityAck: false,
    legalName: "",
    foodResponsibilityAck: false,
    termsAck: false,
    licenseNote: "",
  };
}

function initialsPlaceholderDataUrl(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2
    ? `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`
    : (parts[0] ?? "FX").slice(0, 2)
  ).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#1f6b45"/><text x="50%" y="54%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="180" font-weight="700" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function uploadInitialsLogo(name: string): Promise<string> {
  const dataUrl = initialsPlaceholderDataUrl(name);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], "logo-initials.svg", { type: "image/svg+xml" });
  return uploadRestaurantFoodImage(file);
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setDraftHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<FormState> & { step?: number };
      setForm((prev) => ({
        ...prev,
        ...parsed,
        dayHours: Array.isArray(parsed.dayHours) && parsed.dayHours.length === 7
          ? parsed.dayHours
          : prev.dayHours,
        country: parsed.country || prev.country,
      }));
      if (typeof parsed.step === "number") setStep(Math.min(STEPS.length - 1, Math.max(0, parsed.step)));
    } catch {
      /* ignore corrupt draft */
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, step }));
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form, step, draftHydrated]);

  const stepMeta = useMemo(
    () => [
      {
        title: t("restaurant.stepBusinessInfo", { defaultValue: "Business" }),
        body: t("restaurant.stepBusinessInfoBody", {
          defaultValue: "Name, category, photos, and contact details.",
        }),
      },
      {
        title: t("restaurant.stepLocation", { defaultValue: "Location" }),
        body: t("restaurant.stepLocationBody", {
          defaultValue: "Country, address, pickup point, and map location.",
        }),
      },
      {
        title: t("restaurant.stepHours", { defaultValue: "Hours" }),
        body: t("restaurant.stepHoursBody", {
          defaultValue: "Daily hours and owner-managed fulfillment.",
        }),
      },
      {
        title: t("restaurant.stepIdentity", { defaultValue: "Identity" }),
        body: t("restaurant.stepIdentityBody", {
          defaultValue: "Verify identity before publishing.",
        }),
      },
      {
        title: t("restaurant.stepSafety", { defaultValue: "Food safety" }),
        body: t("restaurant.stepSafetyBody", {
          defaultValue: "Food safety acknowledgment and requirements.",
        }),
      },
      {
        title: t("restaurant.stepPublish", { defaultValue: "Review" }),
        body: t("restaurant.stepPublishBody", {
          defaultValue: "Review and submit for administrative approval.",
        }),
      },
    ],
    [t],
  );

  function markTouched(key: string) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function infoErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.businessType) e.businessType = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.cuisineTags.trim()) e.cuisineTags = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.description.trim()) e.description = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.phone.trim()) e.phone = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = t("restaurant.invalidEmail", { defaultValue: "Enter a valid email" });
    }
    if (!form.logoUrl && !form.coverUrl) {
      e.images = t("restaurant.imageRequired", {
        defaultValue: "Add a logo or cover photo (or generate initials logo).",
      });
    }
    return e;
  }

  function locationErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.country.trim()) e.country = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.region.trim()) e.region = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.city.trim()) e.city = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.streetAddress.trim()) e.streetAddress = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.publicPickupAddress.trim() && form.businessType !== "home_kitchen") {
      e.publicPickupAddress = t("restaurant.fieldRequired", { defaultValue: "Required" });
    }
    return e;
  }

  function hoursErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.fulfillment) e.fulfillment = t("restaurant.fieldRequired", { defaultValue: "Required" });
    const openDays = form.dayHours.filter((d) => !d.isClosed);
    if (openDays.length === 0 && !form.temporarilyClosed) {
      e.hours = t("restaurant.atLeastOneOpenDay", { defaultValue: "Select at least one open day, or mark temporary closure." });
    }
    for (const d of openDays) {
      if (!d.open24h && (!d.openTime || !d.closeTime)) {
        e.hours = t("restaurant.hoursIncomplete", { defaultValue: "Set open and close times for each open day." });
        break;
      }
    }
    if ((form.fulfillment === "delivery" || form.fulfillment === "both") && !form.deliveryZones.trim()) {
      e.deliveryZones = t("restaurant.fieldRequired", { defaultValue: "Required" });
    }
    return e;
  }

  function identityErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.identityAck) e.identityAck = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.legalName.trim()) e.legalName = t("restaurant.fieldRequired", { defaultValue: "Required" });
    return e;
  }

  function safetyErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.foodResponsibilityAck) e.foodResponsibilityAck = t("restaurant.fieldRequired", { defaultValue: "Required" });
    if (!form.termsAck) e.termsAck = t("restaurant.fieldRequired", { defaultValue: "Required" });
    return e;
  }

  function stepErrors(): Record<string, string> {
    if (step === 0) return infoErrors();
    if (step === 1) return locationErrors();
    if (step === 2) return hoursErrors();
    if (step === 3) return identityErrors();
    if (step === 4) return safetyErrors();
    return {};
  }

  function canAdvance(): boolean {
    return Object.keys(stepErrors()).length === 0;
  }

  async function ensureDraftRestaurant(): Promise<number> {
    if (form.restaurantId) return form.restaurantId;
    let logoUrl = form.logoUrl;
    if (!logoUrl && form.name.trim()) {
      try {
        logoUrl = await uploadInitialsLogo(form.name);
        setForm((f) => ({ ...f, logoUrl }));
      } catch {
        /* optional */
      }
    }
    const homeKitchen = form.businessType === "home_kitchen";
    const r = await createRestaurant({
      name: form.name.trim(),
      businessType: form.businessType,
      description: form.description.trim(),
      country: form.country,
      region: form.region.trim(),
      city: form.city.trim(),
      streetAddress: form.streetAddress.trim(),
      publicPickupAddress: form.publicPickupAddress.trim() || (homeKitchen ? undefined : form.streetAddress.trim()),
      privateResidentialAddress: homeKitchen ? form.streetAddress.trim() : undefined,
      showPublicAddress: homeKitchen ? false : !form.privateHomeAddress,
      cuisineTags: form.cuisineTags.split(",").map((s) => s.trim()).filter(Boolean),
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim() || undefined,
      contactEmail: form.email.trim() || undefined,
      logoUrl: logoUrl || undefined,
      coverUrl: form.coverUrl || undefined,
      latitude: form.latitude ? Number(form.latitude) : undefined,
      longitude: form.longitude ? Number(form.longitude) : undefined,
      fulfillment: form.fulfillment,
      permitsNote: [
        form.email.trim() ? `contactEmail:${form.email.trim()}` : "",
        form.licenseNote.trim(),
      ].filter(Boolean).join("\n") || undefined,
    });
    setForm((f) => ({ ...f, restaurantId: r.id, logoUrl: logoUrl || f.logoUrl }));
    return r.id;
  }

  async function persistHoursAndDelivery(restaurantId: number) {
    const hours = form.dayHours.map((d) => ({
      weekday: d.weekday,
      isClosed: d.isClosed || form.temporarilyClosed,
      openTime: d.open24h ? "00:00" : d.openTime,
      closeTime: d.open24h ? "23:59" : d.closeTime,
      overnight: d.overnight || (d.open24h ? false : d.openTime > d.closeTime),
    }));
    await fetch(`/api/restaurants/${restaurantId}/hours`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ hours }),
    });
    const wantsDelivery = form.fulfillment === "delivery" || form.fulfillment === "both";
    await fetch(`/api/restaurants/${restaurantId}/delivery`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        fulfillment: form.fulfillment,
        ownerManagedDelivery: true,
        usesFlexaDrivers: false,
        pickupAvailable: form.fulfillment === "pickup" || form.fulfillment === "both",
        deliveryAvailable: wantsDelivery,
        deliveryFee: Number(form.deliveryFee) || 0,
        deliveryZones: form.deliveryZones.split(",").map((s) => s.trim()).filter(Boolean),
        estimatedPrepMinutes: Number(form.estimatedPrepMinutes) || 30,
        estimatedDeliveryMinutes: Number(form.estimatedDeliveryMinutes) || 45,
        deliveryInstructions: "Delivery is managed directly by this business.",
      }),
    });
    await updateRestaurant(restaurantId, {
      temporarilyClosed: form.temporarilyClosed,
      acceptsReservations: form.acceptsReservations || form.dineIn,
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim() || null,
      publicPickupAddress: form.publicPickupAddress.trim() || null,
      logoUrl: form.logoUrl || null,
      coverUrl: form.coverUrl || null,
    });
  }

  async function goNext() {
    setAttemptedNext(true);
    if (!canAdvance()) {
      setError(t("restaurant.completeRequiredFields", {
        defaultValue: "Please complete the required fields before continuing.",
      }));
      return;
    }
    setError(null);
    setAttemptedNext(false);

    // Persist draft before identity / food-safety so ?rid= links work.
    if (step === 2) {
      setSaving(true);
      try {
        const id = await ensureDraftRestaurant();
        await persistHoursAndDelivery(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save draft");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }

    if (step === 3 && form.restaurantId && form.reuseKyc) {
      try {
        await fetch(`/api/restaurants/${form.restaurantId}/identity`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ reuseMarketKyc: true, legalName: form.legalName.trim() }),
        });
      } catch {
        /* non-blocking — owner can finish on identity page */
      }
    }

    if (step === 4 && form.restaurantId && form.foodResponsibilityAck) {
      try {
        await updateRestaurant(form.restaurantId, {
          foodResponsibilityAccepted: true,
          permitsNote: form.licenseNote.trim() || undefined,
        });
      } catch {
        /* owner can complete quiz on dedicated page */
      }
    }

    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function onUpload(kind: "logo" | "cover", file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("restaurant.invalidImageType", { defaultValue: "Please choose an image file." }));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(t("restaurant.imageTooLarge", { defaultValue: "Image must be under 8 MB." }));
      return;
    }
    setUploading(kind);
    setError(null);
    try {
      const url = await uploadRestaurantFoodImage(file);
      setForm((f) => ({ ...f, [kind === "logo" ? "logoUrl" : "coverUrl"]: url }));
      if (form.restaurantId) {
        await updateRestaurant(form.restaurantId, {
          [kind === "logo" ? "logoUrl" : "coverUrl"]: url,
        }).catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function onGenerateInitialsLogo() {
    if (form.name.trim().length < 2) {
      setError(t("restaurant.nameBeforeLogo", { defaultValue: "Enter a business name first." }));
      return;
    }
    setUploading("logo");
    setError(null);
    try {
      const url = await uploadInitialsLogo(form.name);
      setForm((f) => ({ ...f, logoUrl: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate logo");
    } finally {
      setUploading(null);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError(t("restaurant.geoUnavailable", { defaultValue: "Location is not available on this device." }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: String(pos.coords.latitude.toFixed(6)),
          longitude: String(pos.coords.longitude.toFixed(6)),
        }));
        setError(null);
      },
      () => setError(t("restaurant.geoDenied", { defaultValue: "Could not read current location." })),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function onSaveDraftOnly() {
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(infoErrors()).length || Object.keys(locationErrors()).length) {
        setError(t("restaurant.draftNeedsBasics", {
          defaultValue: "Add business name, category, and location before saving a server draft.",
        }));
        setSaving(false);
        return;
      }
      const id = await ensureDraftRestaurant();
      await persistHoursAndDelivery(id);
      setError(null);
      alert(t("restaurant.draftSaved", { defaultValue: "Draft saved. You can continue later." }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitForReview() {
    setAttemptedNext(true);
    const all = {
      ...infoErrors(),
      ...locationErrors(),
      ...hoursErrors(),
      ...identityErrors(),
      ...safetyErrors(),
    };
    if (Object.keys(all).length) {
      setError(t("restaurant.completeRequiredFields", {
        defaultValue: "Please complete the required fields before continuing.",
      }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await ensureDraftRestaurant();
      await persistHoursAndDelivery(id);
      await updateRestaurant(id, {
        submit: true,
        foodResponsibilityAccepted: true,
      });
      localStorage.removeItem(DRAFT_KEY);
      setLocation(`/restaurant/owner?rid=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const errors = attemptedNext ? stepErrors() : {};
  const show = (key: string) => Boolean(errors[key] || (touched[key] && stepErrors()[key]));
  const fieldErr = (key: string) => (show(key) ? stepErrors()[key] : undefined);

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell
        title={t("restaurant.addRestaurantTitle")}
        subtitle={t("restaurant.addRestaurantSubtitle")}
      >
        <div className="mb-3">
          <RestaurantNotice>
            {t("restaurant.deliveryManagedByBusiness", {
              defaultValue: "Delivery is managed directly by this business.",
            })}
          </RestaurantNotice>
        </div>

        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[hsl(152,55%,28%)]" data-testid="restaurant-reg-step-label">
            {t("restaurant.stepOf", {
              defaultValue: "Step {{current}} of {{total}}",
              current: step + 1,
              total: STEPS.length,
            })}
            {" · "}
            {stepMeta[step]?.title}
          </p>
          <button
            type="button"
            onClick={() => void onSaveDraftOnly()}
            disabled={saving}
            className="shrink-0 rounded-full border border-[hsl(152,40%,35%)] px-3 py-1 text-[11px] font-semibold text-[hsl(152,55%,28%)]"
          >
            {t("restaurant.saveDraft", { defaultValue: "Save draft" })}
          </button>
        </div>

        <div
          className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-testid="restaurant-reg-steps"
        >
          {stepMeta.map((s, i) => (
            <button
              key={STEPS[i]}
              type="button"
              onClick={() => {
                if (i <= step) setStep(i);
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap sm:text-xs ${
                i === step
                  ? "bg-[hsl(152,55%,28%)] text-white"
                  : i < step
                    ? "bg-[hsl(152,30%,90%)] text-[hsl(152,55%,22%)]"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}. {s.title}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">{stepMeta[step]?.body}</p>

        {step === 0 && (
          <BusinessInfoStep
            form={form}
            setForm={setForm}
            t={t}
            fieldErr={fieldErr}
            markTouched={markTouched}
            onUpload={onUpload}
            uploading={uploading}
            onGenerateInitialsLogo={() => void onGenerateInitialsLogo()}
            imagesError={fieldErr("images")}
          />
        )}

        {step === 1 && (
          <LocationStep
            form={form}
            setForm={setForm}
            t={t}
            fieldErr={fieldErr}
            markTouched={markTouched}
            onUseLocation={useCurrentLocation}
          />
        )}

        {step === 2 && (
          <HoursStep form={form} setForm={setForm} t={t} fieldErr={fieldErr} markTouched={markTouched} />
        )}

        {step === 3 && (
          <div className="mt-4 space-y-3" data-testid="restaurant-identity-step">
            <p className="text-sm">{t("restaurant.identityPrivacyBody")}</p>
            <Field
              label={t("restaurant.legalName", { defaultValue: "Owner’s legal name" })}
              required
              value={form.legalName}
              error={fieldErr("legalName")}
              onBlur={() => markTouched("legalName")}
              onChange={(v) => setForm((f) => ({ ...f, legalName: v }))}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.reuseKyc}
                onChange={(e) => setForm((f) => ({ ...f, reuseKyc: e.target.checked }))}
              />
              <span>
                {t("restaurant.reuseMarketKyc", {
                  defaultValue: "Reuse verified Flexa Market KYC when available",
                })}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.identityAck}
                onChange={(e) => {
                  setForm((f) => ({ ...f, identityAck: e.target.checked }));
                  markTouched("identityAck");
                }}
              />
              <span>
                {t("restaurant.identityAck", {
                  defaultValue:
                    "I understand identity documents stay private and publishing requires verification.",
                })}
              </span>
            </label>
            {fieldErr("identityAck") ? (
              <span className="block text-xs text-destructive">{fieldErr("identityAck")}</span>
            ) : null}
            {form.restaurantId ? (
              <Link
                href={`/restaurant/owner/identity?rid=${form.restaurantId}`}
                className="inline-block text-sm font-semibold text-[hsl(152,55%,28%)]"
              >
                {t("restaurant.identityVerification")}
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("restaurant.identityAfterDraft", {
                  defaultValue: "Document upload opens after the draft is saved on the next continue.",
                })}
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="mt-4 space-y-3" data-testid="restaurant-safety-step">
            <RestaurantNotice>
              {t("restaurant.foodSafetyByCountry", {
                defaultValue:
                  "Licensing and permits depend on your country and business type. Identity verification is not food safety certification.",
              })}
            </RestaurantNotice>
            {form.businessType === "home_kitchen" ? (
              <p className="text-xs text-muted-foreground">
                {t("restaurant.homeKitchenSafetyNote", {
                  defaultValue:
                    "Home kitchens follow lighter permit rules where local law allows, but still require food responsibility acknowledgment.",
                })}
              </p>
            ) : null}
            <Field
              label={t("restaurant.licenseNote", {
                defaultValue: "License / permit notes (if required in your country)",
              })}
              value={form.licenseNote}
              multiline
              onChange={(v) => setForm((f) => ({ ...f, licenseNote: v }))}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.foodResponsibilityAck}
                onChange={(e) => {
                  setForm((f) => ({ ...f, foodResponsibilityAck: e.target.checked }));
                  markTouched("foodResponsibilityAck");
                }}
              />
              <span>
                {t("restaurant.foodResponsibilityAck", {
                  defaultValue:
                    "I am responsible for food safety, preparation, and any delivery my business provides.",
                })}
              </span>
            </label>
            {fieldErr("foodResponsibilityAck") ? (
              <span className="block text-xs text-destructive">{fieldErr("foodResponsibilityAck")}</span>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.termsAck}
                onChange={(e) => {
                  setForm((f) => ({ ...f, termsAck: e.target.checked }));
                  markTouched("termsAck");
                }}
              />
              <span>
                {t("restaurant.acceptTerms", { defaultValue: "I accept the food safety terms" })}
              </span>
            </label>
            {fieldErr("termsAck") ? (
              <span className="block text-xs text-destructive">{fieldErr("termsAck")}</span>
            ) : null}
            {form.restaurantId ? (
              <Link
                href={`/restaurant/owner/food-safety?rid=${form.restaurantId}`}
                className="inline-block text-sm font-semibold text-[hsl(152,55%,28%)]"
              >
                {t("restaurant.foodSafetyQuiz")}
              </Link>
            ) : null}
          </div>
        )}

        {step === 5 && (
          <ReviewStep form={form} t={t} onEdit={setStep} />
        )}

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAttemptedNext(false);
                setStep((s) => s - 1);
              }}
              className="rounded-full border px-4 py-2.5 text-sm font-semibold"
            >
              {t("common.back", { defaultValue: "Back" })}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void goNext()}
              className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving
                ? t("common.saving", { defaultValue: "Saving…" })
                : t("common.continue", { defaultValue: "Continue" })}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSubmitForReview()}
              className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              data-testid="restaurant-submit-review"
            >
              {saving
                ? t("common.saving", { defaultValue: "Saving…" })
                : t("restaurant.submitForReview", { defaultValue: "Submit for review" })}
            </button>
          )}
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function BusinessInfoStep({
  form,
  setForm,
  t,
  fieldErr,
  markTouched,
  onUpload,
  uploading,
  onGenerateInitialsLogo,
  imagesError,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  t: (k: string, o?: Record<string, unknown>) => string;
  fieldErr: (k: string) => string | undefined;
  markTouched: (k: string) => void;
  onUpload: (kind: "logo" | "cover", file: File | null) => void;
  uploading: "logo" | "cover" | null;
  onGenerateInitialsLogo: () => void;
  imagesError?: string;
}) {
  return (
    <div className="mt-4 space-y-4" data-testid="restaurant-basics-form">
      <div>
        <p className="mb-2 text-sm font-semibold">
          {t("restaurant.businessCategory", { defaultValue: "Business category" })}
          <span className="text-destructive"> *</span>
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRIMARY_TYPES.map((ty) => {
            const selected = form.businessType === ty.id;
            return (
              <button
                key={ty.id}
                type="button"
                onClick={() => {
                  setForm((f) => ({
                    ...f,
                    businessType: ty.id,
                    privateHomeAddress: ty.id === "home_kitchen" ? true : f.privateHomeAddress,
                    dineIn: ty.id === "traditional" || ty.id === "bakery" ? f.dineIn : false,
                  }));
                  markTouched("businessType");
                }}
                className={`overflow-hidden rounded-2xl border text-left transition ${
                  selected
                    ? "border-[hsl(152,55%,28%)] ring-2 ring-[hsl(152,55%,28%)]"
                    : "border-black/10"
                }`}
                data-testid={`reg-type-${ty.id}`}
              >
                <div className="relative aspect-[4/3] bg-[hsl(152,20%,20%)]">
                  <img src={ty.photo} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <span className="absolute bottom-2 left-2 right-2 text-xs font-bold text-white">
                    {t(ty.labelKey)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {fieldErr("businessType") ? (
          <span className="mt-1 block text-xs text-destructive">{fieldErr("businessType")}</span>
        ) : null}
      </div>

      <Field
        label={t("restaurant.businessName", { defaultValue: "Business name" })}
        required
        value={form.name}
        error={fieldErr("name")}
        onBlur={() => markTouched("name")}
        onChange={(v) => setForm((f) => ({ ...f, name: v }))}
      />
      <Field
        label={t("restaurant.cuisine", { defaultValue: "Cuisine type" })}
        required
        value={form.cuisineTags}
        placeholder={t("restaurant.cuisinePlaceholder", { defaultValue: "e.g. Haitian, Grill, Bakery" })}
        error={fieldErr("cuisineTags")}
        onBlur={() => markTouched("cuisineTags")}
        onChange={(v) => setForm((f) => ({ ...f, cuisineTags: v }))}
      />
      <Field
        label={t("restaurant.description", { defaultValue: "Business description" })}
        required
        value={form.description}
        multiline
        error={fieldErr("description")}
        onBlur={() => markTouched("description")}
        onChange={(v) => setForm((f) => ({ ...f, description: v }))}
      />
      <Field
        label={t("restaurant.phone", { defaultValue: "Business phone number" })}
        required
        value={form.phone}
        error={fieldErr("phone")}
        onBlur={() => markTouched("phone")}
        onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
      />
      <Field
        label={t("restaurant.businessEmail", { defaultValue: "Business email (optional)" })}
        value={form.email}
        error={fieldErr("email")}
        onBlur={() => markTouched("email")}
        onChange={(v) => setForm((f) => ({ ...f, email: v }))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ImageUploadCard
          label={t("restaurant.businessLogo", { defaultValue: "Business logo" })}
          hint={t("restaurant.logoHint", { defaultValue: "Square 1:1 recommended" })}
          url={form.logoUrl}
          uploading={uploading === "logo"}
          onPick={(file) => onUpload("logo", file)}
          onRemove={() => setForm((f) => ({ ...f, logoUrl: "" }))}
          aspect="square"
        />
        <ImageUploadCard
          label={t("restaurant.coverImage", { defaultValue: "Cover photo" })}
          hint={t("restaurant.coverHint", { defaultValue: "Landscape 16:9 recommended" })}
          url={form.coverUrl}
          uploading={uploading === "cover"}
          onPick={(file) => onUpload("cover", file)}
          onRemove={() => setForm((f) => ({ ...f, coverUrl: "" }))}
          aspect="wide"
        />
      </div>
      {imagesError ? <span className="block text-xs text-destructive">{imagesError}</span> : null}
      <button
        type="button"
        onClick={onGenerateInitialsLogo}
        disabled={uploading === "logo"}
        className="text-sm font-semibold text-[hsl(152,55%,28%)] underline-offset-2 hover:underline"
      >
        {t("restaurant.generateInitialsLogo", {
          defaultValue: "No logo yet? Generate initials placeholder",
        })}
      </button>
    </div>
  );
}

function LocationStep({
  form,
  setForm,
  t,
  fieldErr,
  markTouched,
  onUseLocation,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  t: (k: string, o?: Record<string, unknown>) => string;
  fieldErr: (k: string) => string | undefined;
  markTouched: (k: string) => void;
  onUseLocation: () => void;
}) {
  const homeKitchen = form.businessType === "home_kitchen";
  return (
    <div className="mt-4 space-y-3" data-testid="restaurant-location-form">
      <label className="block text-sm font-semibold">
        {t("restaurant.country", { defaultValue: "Country" })}
        <span className="text-destructive"> *</span>
        <select
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          onBlur={() => markTouched("country")}
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
        >
          {REGISTRATION_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {fieldErr("country") ? (
          <span className="mt-1 block text-xs text-destructive">{fieldErr("country")}</span>
        ) : null}
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {t("restaurant.usCaDisabledNote", {
            defaultValue: "United States and Canada are unavailable for public registration.",
          })}
        </span>
      </label>

      <Field
        label={t("restaurant.region", { defaultValue: "Department / state / region" })}
        required
        value={form.region}
        error={fieldErr("region")}
        onBlur={() => markTouched("region")}
        onChange={(v) => setForm((f) => ({ ...f, region: v }))}
      />
      <Field
        label={t("restaurant.city", { defaultValue: "City / commune" })}
        required
        value={form.city}
        error={fieldErr("city")}
        onBlur={() => markTouched("city")}
        onChange={(v) => setForm((f) => ({ ...f, city: v }))}
      />
      <Field
        label={
          homeKitchen
            ? t("restaurant.privateAddress", { defaultValue: "Private home address (never public)" })
            : t("restaurant.address", { defaultValue: "Business address" })
        }
        required
        value={form.streetAddress}
        error={fieldErr("streetAddress")}
        onBlur={() => markTouched("streetAddress")}
        onChange={(v) => setForm((f) => ({ ...f, streetAddress: v }))}
      />
      <Field
        label={t("restaurant.pickupAddress", { defaultValue: "Pickup address" })}
        required={!homeKitchen}
        value={form.publicPickupAddress}
        error={fieldErr("publicPickupAddress")}
        onBlur={() => markTouched("publicPickupAddress")}
        onChange={(v) => setForm((f) => ({ ...f, publicPickupAddress: v }))}
        placeholder={
          homeKitchen
            ? t("restaurant.pickupOptionalHome", {
                defaultValue: "Optional public meeting point (not your home street)",
              })
            : undefined
        }
      />
      {homeKitchen ? (
        <RestaurantNotice>
          {t("restaurant.homeKitchenPrivacy", {
            defaultValue: "Home kitchen residential addresses stay private and are never shown publicly.",
          })}
        </RestaurantNotice>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Field
          label={t("restaurant.latitude", { defaultValue: "Latitude" })}
          value={form.latitude}
          onChange={(v) => setForm((f) => ({ ...f, latitude: v }))}
        />
        <Field
          label={t("restaurant.longitude", { defaultValue: "Longitude" })}
          value={form.longitude}
          onChange={(v) => setForm((f) => ({ ...f, longitude: v }))}
        />
      </div>
      <button
        type="button"
        onClick={onUseLocation}
        className="rounded-full border border-[hsl(152,40%,35%)] px-3 py-2 text-xs font-semibold text-[hsl(152,55%,28%)]"
      >
        {t("restaurant.useCurrentLocation", { defaultValue: "Use current location" })}
      </button>

      <Field
        label={t("restaurant.contactPhone", { defaultValue: "Contact phone number" })}
        required
        value={form.phone}
        onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
      />
      <Field
        label={t("restaurant.whatsappOptional", { defaultValue: "WhatsApp number (optional)" })}
        value={form.whatsapp}
        onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))}
      />

      {form.businessType === "food_truck" ? (
        <RestaurantNotice>
          {t("restaurant.foodTruckLocationNote", {
            defaultValue: "Food truck owners can update their operating location anytime after registration.",
          })}
        </RestaurantNotice>
      ) : null}
    </div>
  );
}

function HoursStep({
  form,
  setForm,
  t,
  fieldErr,
  markTouched,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  t: (k: string, o?: Record<string, unknown>) => string;
  fieldErr: (k: string) => string | undefined;
  markTouched: (k: string) => void;
}) {
  const wantsDelivery = form.fulfillment === "delivery" || form.fulfillment === "both";
  const canDineIn = form.businessType === "traditional" || form.businessType === "bakery";

  function patchDay(weekday: number, patch: Partial<DayHours>) {
    setForm((f) => ({
      ...f,
      dayHours: f.dayHours.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    }));
  }

  return (
    <div className="mt-4 space-y-4" data-testid="restaurant-hours-form">
      <RestaurantNotice>
        {t("restaurant.driverPolicyNote", {
          defaultValue: "Flexa Driver never transports Flexa Restaurant food orders.",
        })}
      </RestaurantNotice>

      <label className="block text-sm font-semibold">
        {t("restaurant.fulfillment", { defaultValue: "Fulfillment" })}
        <span className="text-destructive"> *</span>
        <select
          value={form.fulfillment}
          onChange={(e) => setForm((f) => ({ ...f, fulfillment: e.target.value }))}
          onBlur={() => markTouched("fulfillment")}
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
        >
          <option value="pickup">{t("restaurant.pickup")}</option>
          <option value="delivery">{t("restaurant.delivery")}</option>
          <option value="both">
            {t("restaurant.bothFulfillment", { defaultValue: "Pickup & delivery" })}
          </option>
        </select>
      </label>

      <div className="space-y-2">
        {WEEKDAYS.map((wd) => {
          const day = form.dayHours.find((d) => d.weekday === wd.id)!;
          return (
            <div
              key={wd.id}
              className="rounded-2xl border border-black/5 bg-white p-3 dark:bg-[hsl(152,16%,12%)]"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {t(`restaurant.${wd.key}`, { defaultValue: wd.fallback })}
                </span>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={day.isClosed}
                    onChange={(e) => patchDay(wd.id, { isClosed: e.target.checked })}
                  />
                  {t("restaurant.closedDay", { defaultValue: "Closed" })}
                </label>
              </div>
              {!day.isClosed ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={day.open24h}
                        onChange={(e) => patchDay(wd.id, { open24h: e.target.checked })}
                      />
                      {t("restaurant.open24h", { defaultValue: "Open 24 hours" })}
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={day.overnight}
                        disabled={day.open24h}
                        onChange={(e) => patchDay(wd.id, { overnight: e.target.checked })}
                      />
                      {t("restaurant.overnight", { defaultValue: "Overnight hours" })}
                    </label>
                  </div>
                  {!day.open24h ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="block text-xs font-semibold">
                        {t("restaurant.opens", { defaultValue: "Opens" })}
                        <input
                          type="time"
                          value={day.openTime}
                          onChange={(e) => patchDay(wd.id, { openTime: e.target.value })}
                          className="mt-1 w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block text-xs font-semibold">
                        {t("restaurant.closes", { defaultValue: "Closes" })}
                        <input
                          type="time"
                          value={day.closeTime}
                          onChange={(e) => patchDay(wd.id, { closeTime: e.target.value })}
                          className="mt-1 w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {fieldErr("hours") ? (
          <span className="block text-xs text-destructive">{fieldErr("hours")}</span>
        ) : null}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.temporarilyClosed}
          onChange={(e) => setForm((f) => ({ ...f, temporarilyClosed: e.target.checked }))}
        />
        <span>{t("restaurant.temporaryClosure", { defaultValue: "Temporarily closed" })}</span>
      </label>

      {canDineIn ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.dineIn}
            onChange={(e) => setForm((f) => ({ ...f, dineIn: e.target.checked }))}
          />
          <span>{t("restaurant.dineIn", { defaultValue: "Dine-in available" })}</span>
        </label>
      ) : null}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.acceptsReservations}
          onChange={(e) => setForm((f) => ({ ...f, acceptsReservations: e.target.checked }))}
        />
        <span>{t("restaurant.acceptsReservations", { defaultValue: "Accept reservations" })}</span>
      </label>

      {wantsDelivery ? (
        <div className="space-y-3 rounded-2xl border border-black/5 p-3">
          <p className="text-xs text-muted-foreground">
            {t("restaurant.ownerDeliveryOnly", {
              defaultValue: "Delivery is managed exclusively by your business — never Flexa Driver.",
            })}
          </p>
          <Field
            label={t("restaurant.deliveryZones", { defaultValue: "Delivery zones" })}
            required
            value={form.deliveryZones}
            placeholder={t("restaurant.deliveryZonesPlaceholder", {
              defaultValue: "e.g. Delmas, Pétion-Ville, Tabarre",
            })}
            error={fieldErr("deliveryZones")}
            onBlur={() => markTouched("deliveryZones")}
            onChange={(v) => setForm((f) => ({ ...f, deliveryZones: v }))}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field
              label={t("restaurant.deliveryFee", { defaultValue: "Delivery fee" })}
              value={form.deliveryFee}
              onChange={(v) => setForm((f) => ({ ...f, deliveryFee: v }))}
            />
            <Field
              label={t("restaurant.prepMinutes", { defaultValue: "Prep time (min)" })}
              value={form.estimatedPrepMinutes}
              onChange={(v) => setForm((f) => ({ ...f, estimatedPrepMinutes: v }))}
            />
            <Field
              label={t("restaurant.deliveryMinutes", { defaultValue: "Delivery time (min)" })}
              value={form.estimatedDeliveryMinutes}
              onChange={(v) => setForm((f) => ({ ...f, estimatedDeliveryMinutes: v }))}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewStep({
  form,
  t,
  onEdit,
}: {
  form: FormState;
  t: (k: string, o?: Record<string, unknown>) => string;
  onEdit: (step: number) => void;
}) {
  const typeLabel = PRIMARY_TYPES.find((x) => x.id === form.businessType);
  return (
    <div className="mt-4 space-y-4" data-testid="restaurant-review-step">
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:bg-[hsl(152,16%,12%)]">
        {form.coverUrl ? (
          <img src={form.coverUrl} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-28 items-center justify-center bg-[hsl(152,25%,22%)] text-sm text-white/80">
            {t("restaurant.noCoverYet", { defaultValue: "No cover photo" })}
          </div>
        )}
        <div className="relative px-4 pb-4 pt-0">
          <div className="-mt-8 mb-3 flex items-end gap-3">
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt=""
                className="h-16 w-16 rounded-2xl border-4 border-white object-cover shadow"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-[hsl(152,55%,28%)] text-lg font-bold text-white shadow">
                {form.name.slice(0, 2).toUpperCase() || "FX"}
              </div>
            )}
            <div className="pb-1">
              <p className="text-base font-bold">{form.name || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {typeLabel ? t(typeLabel.labelKey) : form.businessType}
                {" · "}
                {form.cuisineTags}
              </p>
            </div>
          </div>
          <p className="text-sm">{form.description}</p>
          <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <div>
              <dt className="inline font-semibold text-foreground">
                {t("restaurant.location", { defaultValue: "Location" })}:{" "}
              </dt>
              <dd className="inline">
                {form.city}, {form.region}, {form.country}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold text-foreground">
                {t("restaurant.contact", { defaultValue: "Contact" })}:{" "}
              </dt>
              <dd className="inline">
                {form.phone}
                {form.whatsapp ? ` · WhatsApp ${form.whatsapp}` : ""}
                {form.email ? ` · ${form.email}` : ""}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold text-foreground">
                {t("restaurant.fulfillment", { defaultValue: "Fulfillment" })}:{" "}
              </dt>
              <dd className="inline">{form.fulfillment}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-foreground">
                {t("restaurant.pickupAddress", { defaultValue: "Pickup" })}:{" "}
              </dt>
              <dd className="inline">{form.publicPickupAddress || "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onEdit(i)}
            className="rounded-full border px-3 py-1 text-[11px] font-semibold"
          >
            {t("common.edit", { defaultValue: "Edit" })}{" "}
            {t(
              [
                "restaurant.stepBusinessInfo",
                "restaurant.stepLocation",
                "restaurant.stepHours",
                "restaurant.stepIdentity",
                "restaurant.stepSafety",
              ][i]!,
              { defaultValue: ["Business", "Location", "Hours", "Identity", "Safety"][i] },
            )}
          </button>
        ))}
      </div>

      <RestaurantNotice>
        {t("restaurant.adminApprovalRequired", {
          defaultValue:
            "Submitting places your business Under Review. It will not publish until Super Admin approval. Countries stay default-deny until regulatory approval.",
        })}
      </RestaurantNotice>
      <RestaurantNotice>
        {t("restaurant.driverPolicyNote", {
          defaultValue: "Flexa Driver never transports Flexa Restaurant food orders.",
        })}
      </RestaurantNotice>
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
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  multiline?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  const cls =
    "mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm dark:bg-[hsl(152,16%,12%)]";
  return (
    <label className="block text-sm font-semibold">
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={cls}
          rows={3}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={cls}
        />
      )}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function ImageUploadCard({
  label,
  hint,
  url,
  uploading,
  onPick,
  onRemove,
  aspect,
}: {
  label: string;
  hint: string;
  url: string;
  uploading: boolean;
  onPick: (file: File | null) => void;
  onRemove: () => void;
  aspect: "square" | "wide";
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[hsl(152,30%,55%)] bg-[hsl(152,25%,97%)] p-3 dark:bg-[hsl(152,16%,14%)]">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <div
        className={`mt-2 overflow-hidden rounded-xl bg-[hsl(152,20%,22%)] ${
          aspect === "square" ? "aspect-square max-w-[140px]" : "aspect-video w-full"
        }`}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-white/70">
            {uploading ? "Uploading…" : "No image"}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-full bg-[hsl(152,55%,28%)] px-3 py-1.5 text-[11px] font-semibold text-white">
          {url ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
        {url ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
