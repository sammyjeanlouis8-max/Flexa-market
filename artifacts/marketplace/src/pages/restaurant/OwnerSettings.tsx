import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  fetchRestaurant,
  saveRestaurantDelivery,
  saveRestaurantHours,
  updateRestaurant,
  type Restaurant,
} from "@/lib/restaurantApi";
import { isValidBusinessPhone } from "@/lib/restaurantContact";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

type HourRow = {
  weekday: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
};

export default function OwnerSettings() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [hours, setHours] = useState<HourRow[]>(
    WEEKDAYS.map((weekday) => ({ weekday, isClosed: false, openTime: "09:00", closeTime: "21:00" })),
  );
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery" | "both">("pickup");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [eta, setEta] = useState("45");
  const [prep, setPrep] = useState("30");
  const [radiusKm, setRadiusKm] = useState("5");
  const [freeDeliveryMin, setFreeDeliveryMin] = useState("");
  const [deliverySuspended, setDeliverySuspended] = useState(false);
  const [zones, setZones] = useState("");
  const [instructions, setInstructions] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [enableWhatsapp, setEnableWhatsapp] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    fetchRestaurant(restaurantId)
      .then((r) => {
        setRestaurant(r);
        setPhone(r.phone || "");
        setWhatsapp(r.whatsapp || "");
        setEnableWhatsapp(Boolean(r.whatsapp));
        if (r.fulfillment === "delivery" || r.fulfillment === "both" || r.fulfillment === "pickup") {
          setFulfillment(r.fulfillment);
        }
        if (r.deliveryFee != null) setDeliveryFee(String(r.deliveryFee));
        if (r.minOrderAmount != null) setMinOrder(String(r.minOrderAmount));
        if (r.estimatedDeliveryMinutes != null) setEta(String(r.estimatedDeliveryMinutes));
        if (r.estimatedPrepMinutes != null) setPrep(String(r.estimatedPrepMinutes));
        if ((r as any).deliveryRadiusKm != null) setRadiusKm(String((r as any).deliveryRadiusKm));
        if ((r as any).freeDeliveryMin != null) setFreeDeliveryMin(String((r as any).freeDeliveryMin));
        if ((r as any).deliverySuspended != null) setDeliverySuspended(!!(r as any).deliverySuspended);
        if (r.deliveryZones?.length) setZones(r.deliveryZones.join(", "));
        if (r.hours?.length) {
          setHours(
            WEEKDAYS.map((weekday) => {
              const h = r.hours!.find((x) => x.weekday === weekday);
              return {
                weekday,
                isClosed: h?.isClosed ?? false,
                openTime: h?.openTime || "09:00",
                closeTime: h?.closeTime || "21:00",
              };
            }),
          );
        }
      })
      .catch(() => setRestaurant(null));
  }, [restaurantId]);

  async function save() {
    if (!restaurantId) return;
    if (!isValidBusinessPhone(phone)) {
      setMsg(t("restaurant.invalidBusinessPhone", {
        defaultValue: "Enter a valid public business phone with country code (8–15 digits).",
      }));
      return;
    }
    if (enableWhatsapp && whatsapp.trim() && !isValidBusinessPhone(whatsapp)) {
      setMsg(t("restaurant.invalidWhatsapp", {
        defaultValue: "Enter a valid WhatsApp number with country code, or disable WhatsApp.",
      }));
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await updateRestaurant(restaurantId, {
        phone: phone.trim(),
        whatsapp: enableWhatsapp && whatsapp.trim() ? whatsapp.trim() : null,
      });
      await saveRestaurantHours(
        restaurantId,
        hours.map((h) => ({
          weekday: h.weekday,
          isClosed: h.isClosed,
          openTime: h.isClosed ? null : h.openTime,
          closeTime: h.isClosed ? null : h.closeTime,
        })),
      );
      await saveRestaurantDelivery(restaurantId, {
        fulfillment,
        deliveryFee: Number(deliveryFee) || 0,
        minOrderAmount: Number(minOrder) || 0,
        estimatedDeliveryMinutes: Number(eta) || 45,
        estimatedPrepMinutes: Number(prep) || 30,
        deliveryRadiusKm: Number(radiusKm) || 5,
        freeDeliveryMin: freeDeliveryMin === "" ? undefined : Number(freeDeliveryMin),
        deliverySuspended,
        deliveryAvailable: fulfillment !== "pickup" && !deliverySuspended,
        pickupAvailable: fulfillment !== "delivery",
        deliveryZones: zones.split(",").map((z) => z.trim()).filter(Boolean),
        deliveryInstructions:
          instructions || t("restaurant.deliveryManagedByBusiness", { defaultValue: "Delivery is managed directly by this business." }),
      } as any);
      setMsg(t("restaurant.settingsSaved", { defaultValue: "Hours and delivery settings saved." }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell
        title={t("restaurant.businessHours", { defaultValue: "Hours & delivery" })}
        subtitle={restaurant?.name}
      >
        {!restaurantId ? (
          <p className="text-sm text-destructive">Missing restaurant</p>
        ) : (
          <div className="space-y-6">
            <RestaurantNotice>
              {t("restaurant.deliveryDisclaimer", {
                defaultValue: "Delivery is arranged and managed by this restaurant.",
              })}
            </RestaurantNotice>

            <section className="rounded-2xl border bg-white p-4 dark:bg-[hsl(152,16%,12%)]" data-testid="owner-contact-settings">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {t("restaurant.publicContact", { defaultValue: "Public contact" })}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("restaurant.publicContactHint", {
                  defaultValue:
                    "Shown on your business profile for Call / WhatsApp. Never uses private identity-verification phone numbers.",
                })}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-semibold">
                    {t("restaurant.businessPhone", { defaultValue: "Business phone" })} *
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+509 …"
                    className="w-full rounded-xl border px-3 py-2"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={enableWhatsapp}
                    onChange={(e) => setEnableWhatsapp(e.target.checked)}
                  />
                  {t("restaurant.enableWhatsapp", { defaultValue: "Show WhatsApp on my public profile" })}
                </label>
                {enableWhatsapp ? (
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block font-semibold">
                      {t("restaurant.whatsappNumber", { defaultValue: "WhatsApp number" })}
                    </span>
                    <input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+509 …"
                      className="w-full rounded-xl border px-3 py-2"
                      inputMode="tel"
                    />
                  </label>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {t("restaurant.businessHours", { defaultValue: "Business hours" })}
              </h2>
              <ul className="mt-3 space-y-2">
                {hours.map((h) => (
                  <li key={h.weekday} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-20 font-semibold">
                      {t(`restaurant.weekday${h.weekday}`, { defaultValue: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][h.weekday] })}
                    </span>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={h.isClosed}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((row) => (row.weekday === h.weekday ? { ...row, isClosed: e.target.checked } : row)),
                          )
                        }
                      />
                      {t("restaurant.closed", { defaultValue: "Closed" })}
                    </label>
                    {!h.isClosed && (
                      <>
                        <input
                          type="time"
                          value={h.openTime}
                          onChange={(e) =>
                            setHours((prev) =>
                              prev.map((row) => (row.weekday === h.weekday ? { ...row, openTime: e.target.value } : row)),
                            )
                          }
                          className="rounded-lg border px-2 py-1"
                        />
                        <span>–</span>
                        <input
                          type="time"
                          value={h.closeTime}
                          onChange={(e) =>
                            setHours((prev) =>
                              prev.map((row) => (row.weekday === h.weekday ? { ...row, closeTime: e.target.value } : row)),
                            )
                          }
                          className="rounded-lg border px-2 py-1"
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {t("restaurant.deliverySettings", { defaultValue: "Pickup & delivery" })}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.fulfillment", { defaultValue: "Fulfillment" })}</span>
                  <select
                    value={fulfillment}
                    onChange={(e) => setFulfillment(e.target.value as "pickup" | "delivery" | "both")}
                    className="w-full rounded-xl border px-3 py-2"
                  >
                    <option value="pickup">{t("restaurant.pickup")}</option>
                    <option value="delivery">{t("restaurant.delivery")}</option>
                    <option value="both">{t("restaurant.both", { defaultValue: "Pickup & delivery" })}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.deliveryFee", { defaultValue: "Delivery fee" })}</span>
                  <input value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.minOrder", { defaultValue: "Minimum order" })}</span>
                  <input value={minOrder} onChange={(e) => setMinOrder(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.etaMinutes", { defaultValue: "Est. delivery minutes" })}</span>
                  <input value={eta} onChange={(e) => setEta(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.estimatedPrepMinutes", { defaultValue: "Est. prep minutes" })}</span>
                  <input value={prep} onChange={(e) => setPrep(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.deliveryRadiusKm", { defaultValue: "Delivery radius (km)" })}</span>
                  <input value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.freeDeliveryMin", { defaultValue: "Free delivery from" })}</span>
                  <input value={freeDeliveryMin} onChange={(e) => setFreeDeliveryMin(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="optional" />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={deliverySuspended} onChange={(e) => setDeliverySuspended(e.target.checked)} />
                  {t("restaurant.deliverySuspended", { defaultValue: "Temporarily suspend delivery" })}
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-semibold">{t("restaurant.deliveryZones", { defaultValue: "Service areas (comma-separated)" })}</span>
                  <input value={zones} onChange={(e) => setZones(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-semibold">{t("restaurant.deliveryInstructions", { defaultValue: "Delivery notes" })}</span>
                  <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="min-h-[80px] w-full rounded-xl border px-3 py-2" />
                </label>
              </div>
            </section>

            {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-full bg-[hsl(152,55%,28%)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? t("common.loading") : t("common.save", { defaultValue: "Save" })}
            </button>
          </div>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
