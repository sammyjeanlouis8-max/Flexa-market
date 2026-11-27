import { useState, type Dispatch, type SetStateAction } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { createRestaurant } from "@/lib/restaurantApi";
import { useAuth } from "@/contexts/auth";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { isRestaurantCountryHardDisabled, restaurantRegistrationCountries } from "@/lib/restaurantCountryPolicy";

const REGISTRATION_COUNTRIES = restaurantRegistrationCountries(SUPPORTED_COUNTRIES);

const STEPS = ["basics", "hours", "identity", "safety", "publish"] as const;

export default function AddRestaurant() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    businessType: "traditional",
    description: "",
    country: user?.country && !isRestaurantCountryHardDisabled(user.country) ? user.country : "Haiti",
    city: "",
    streetAddress: "",
    cuisineTags: "",
    fulfillment: "pickup",
    openTime: "08:00",
    closeTime: "20:00",
  });

  const stepMeta = [
    { title: t("restaurant.stepBasics"), body: t("restaurant.stepBasicsBody") },
    { title: t("restaurant.stepHours"), body: t("restaurant.stepHoursBody") },
    { title: t("restaurant.stepIdentity"), body: t("restaurant.stepIdentityBody") },
    { title: t("restaurant.stepSafety"), body: t("restaurant.stepSafetyBody") },
    { title: t("restaurant.stepPublish"), body: t("restaurant.stepPublishBody") },
  ];

  async function onCreateDraft() {
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
      const r = await createRestaurant({
        name: form.name,
        businessType: form.businessType,
        description: form.description,
        country: form.country,
        city: form.city,
        streetAddress: form.streetAddress,
        cuisineTags: form.cuisineTags.split(",").map((s) => s.trim()).filter(Boolean),
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
          deliveryFee: 0,
          deliveryInstructions: "Restaurant manages its own delivery — not Flexa Market drivers.",
        }),
      });
      setLocation(`/restaurant/owner?rid=${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.addRestaurantTitle")} subtitle={t("restaurant.addRestaurantSubtitle")}>
        <div className="mb-4 space-y-2">
          <RestaurantNotice>{t("restaurant.freeLaunchNote")}</RestaurantNotice>
        </div>
        <div className="mb-4 flex gap-1 overflow-x-auto">
          {stepMeta.map((s, i) => (
            <button
              key={STEPS[i]}
              type="button"
              onClick={() => setStep(i)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${i === step ? "bg-[hsl(152,55%,28%)] text-white" : "bg-muted"}`}
            >
              {s.title}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{stepMeta[step]?.body}</p>

        {step === 0 && (
          <motionFormFields form={form} setForm={setForm} t={t} />
        )}
        {step === 1 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t("restaurant.stepHoursBody")}</p>
            <RestaurantNotice>
              Restaurant delivery is managed by the restaurant owner — not Flexa Market drivers.
            </RestaurantNotice>
            <label className="block text-sm font-semibold">
              Fulfillment
              <select
                value={form.fulfillment}
                onChange={(e) => setForm((f) => ({ ...f, fulfillment: e.target.value }))}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="pickup">{t("restaurant.pickup")}</option>
                <option value="delivery">{t("restaurant.delivery")}</option>
                <option value="both">{t("restaurant.bothFulfillment")}</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-semibold">
                Opens
                <input type="time" value={form.openTime} onChange={(e) => setForm((f) => ({ ...f, openTime: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm font-semibold">
                Closes
                <input type="time" value={form.closeTime} onChange={(e) => setForm((f) => ({ ...f, closeTime: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm">{t("restaurant.identityPrivacyBody")}</p>
            <Link href="/restaurant/owner/identity" className="text-sm font-semibold text-[hsl(152,55%,28%)]">
              {t("restaurant.identityVerification")}
            </Link>
          </div>
        )}
        {step === 3 && (
          <div className="mt-4 space-y-3">
            <RestaurantNotice>
              {t("restaurant.foodResponsibilityAck")}
            </RestaurantNotice>
            <RestaurantNotice>
              {t("restaurant.deliveryManagedByBusiness", {
                defaultValue: "Delivery is managed directly by this business.",
              })}
            </RestaurantNotice>
            <Link href="/restaurant/owner/food-safety" className="inline-block text-sm font-semibold text-[hsl(152,55%,28%)]">
              {t("restaurant.foodSafetyQuiz")}
            </Link>
          </div>
        )}
        {step === 4 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm">{t("restaurant.stepPublishBody")}</p>
            <RestaurantNotice>
              {t("restaurant.driverPolicyNote", {
                defaultValue: "Flexa Driver never transports Flexa Restaurant food orders.",
              })}
            </RestaurantNotice>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-full border px-4 py-2 text-sm font-semibold">
              {t("common.back", { defaultValue: "Back" })}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
              {t("common.next", { defaultValue: "Next" })}
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={onCreateDraft} className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {t("restaurant.addRestaurant")}
            </button>
          )}
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function motionFormFields({
  form,
  setForm,
  t,
}: {
  form: {
    name: string;
    businessType: string;
    description: string;
    country: string;
    city: string;
    streetAddress: string;
    cuisineTags: string;
    fulfillment: string;
    openTime: string;
    closeTime: string;
  };
  setForm: Dispatch<SetStateAction<typeof form>>;
  t: (k: string) => string;
}) {
  const field = (key: "name" | "description" | "city" | "streetAddress" | "cuisineTags", multiline?: boolean) =>
    multiline ? (
      <textarea
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm dark:bg-[hsl(152,16%,12%)]"
        rows={3}
      />
    ) : (
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm dark:bg-[hsl(152,16%,12%)]"
      />
    );

  return (
    <div className="mt-4 space-y-3">
      <label className="block text-sm font-semibold">Business type
        <select
          value={form.businessType}
          onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
        >
          <option value="home_kitchen">Home Kitchen / Homemade Food</option>
          <option value="traditional">Traditional Restaurant</option>
          <option value="food_truck">Food Truck</option>
          <option value="catering">Catering Business</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block text-sm font-semibold">{t("restaurant.restaurantDetail")}
        {field("name")}
      </label>
      <label className="block text-sm font-semibold">{t("restaurant.cuisine")}
        {field("cuisineTags")}
      </label>
      <label className="block text-sm font-semibold">{t("restaurant.discoverSubtitle")}
        {field("description", true)}
      </label>
      <label className="block text-sm font-semibold">Country
        <select
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
        >
          {REGISTRATION_COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          {/* United States and Canada are omitted — Flexa Restaurant is disabled there by default policy. */}
        </select>
      </label>
      <label className="block text-sm font-semibold">City
        {field("city")}
      </label>
      <label className="block text-sm font-semibold">Address
        {field("streetAddress")}
      </label>
    </div>
  );
}