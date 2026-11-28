import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  createRestaurantDeliveryStaff,
  fetchRestaurant,
  fetchRestaurantDeliveryStaff,
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
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [merchantDeliveryEnabled, setMerchantDeliveryEnabled] = useState(false);
  const [flexaDeliveryEnabled, setFlexaDeliveryEnabled] = useState(false);
  const [flexaFeatureOn, setFlexaFeatureOn] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [feeMode, setFeeMode] = useState<"fixed" | "distance">("fixed");
  const [feePerKm, setFeePerKm] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [eta, setEta] = useState("45");
  const [prep, setPrep] = useState("30");
  const [radiusKm, setRadiusKm] = useState("5");
  const [freeDeliveryMin, setFreeDeliveryMin] = useState("");
  const [deliverySuspended, setDeliverySuspended] = useState(false);
  const [zones, setZones] = useState("");
  const [instructions, setInstructions] = useState("");
  const [staff, setStaff] = useState<Array<{ id: number; displayName: string; phone: string; active: boolean }>>([]);
  const [staffName, setStaffName] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
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
        setPickupEnabled((r as any).pickupAvailable !== false);
        setMerchantDeliveryEnabled(!!((r as any).merchantDeliveryEnabled ?? (r as any).deliveryAvailable));
        setFlexaDeliveryEnabled(!!(r as any).flexaDeliveryEnabled);
        setFlexaFeatureOn(!!(r as any).flexaDeliveryFeatureEnabled);
        if (r.deliveryFee != null) setDeliveryFee(String(r.deliveryFee));
        if ((r as any).feeMode === "distance") setFeeMode("distance");
        if ((r as any).feePerKm != null) setFeePerKm(String((r as any).feePerKm));
        if (r.minOrderAmount != null) setMinOrder(String(r.minOrderAmount));
        if (r.estimatedDeliveryMinutes != null) setEta(String(r.estimatedDeliveryMinutes));
        if (r.estimatedPrepMinutes != null) setPrep(String(r.estimatedPrepMinutes));
        if ((r as any).deliveryRadiusKm != null) setRadiusKm(String((r as any).deliveryRadiusKm));
        if ((r as any).freeDeliveryMin != null) setFreeDeliveryMin(String((r as any).freeDeliveryMin));
        if ((r as any).deliverySuspended != null) setDeliverySuspended(!!(r as any).deliverySuspended);
        if (r.deliveryZones?.length) setZones(r.deliveryZones.join(", "));
        fetchRestaurantDeliveryStaff(restaurantId).then(setStaff).catch(() => setStaff([]));
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
        pickupAvailable: pickupEnabled,
        merchantDeliveryEnabled,
        flexaDeliveryEnabled: flexaFeatureOn ? flexaDeliveryEnabled : false,
        deliveryFee: Number(deliveryFee) || 0,
        feeMode,
        feePerKm: Number(feePerKm) || 0,
        minOrderAmount: Number(minOrder) || 0,
        estimatedDeliveryMinutes: Number(eta) || 45,
        estimatedPrepMinutes: Number(prep) || 30,
        deliveryRadiusKm: Number(radiusKm) || 5,
        freeDeliveryMin: freeDeliveryMin === "" ? null : Number(freeDeliveryMin),
        deliverySuspended,
        deliveryZones: zones.split(",").map((z) => z.trim()).filter(Boolean),
        deliveryHours: hours.map((h) => ({
          weekday: h.weekday,
          isClosed: h.isClosed,
          openTime: h.openTime,
          closeTime: h.closeTime,
        })),
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

  async function addStaff() {
    if (!restaurantId || !staffName.trim()) return;
    try {
      const row = await createRestaurantDeliveryStaff(restaurantId, {
        displayName: staffName.trim(),
        phone: staffPhone.trim(),
      });
      setStaff((prev) => [row, ...prev]);
      setStaffName("");
      setStaffPhone("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not add staff");
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

            <section className="rounded-2xl border bg-white p-4 dark:bg-[hsl(152,16%,12%)]" data-testid="owner-delivery-methods">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {t("restaurant.deliveryMethods", { defaultValue: "Delivery methods" })}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("restaurant.merchantDeliveryHint", {
                  defaultValue: "Merchant delivery uses your own personnel — not Flexa drivers.",
                })}
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={pickupEnabled} onChange={(e) => setPickupEnabled(e.target.checked)} />
                  {t("restaurant.customerPickup", { defaultValue: "Customer Pickup" })}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={merchantDeliveryEnabled} onChange={(e) => setMerchantDeliveryEnabled(e.target.checked)} />
                  {t("restaurant.merchantDelivery", { defaultValue: "Merchant Delivery (restaurant personnel)" })}
                </label>
                <label className={`flex items-center gap-2 ${flexaFeatureOn ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={flexaDeliveryEnabled && flexaFeatureOn}
                    disabled={!flexaFeatureOn}
                    onChange={(e) => setFlexaDeliveryEnabled(e.target.checked)}
                  />
                  {t("restaurant.flexaDelivery", { defaultValue: "Flexa Delivery" })}
                  {!flexaFeatureOn && (
                    <span className="text-xs text-muted-foreground">
                      ({t("restaurant.flexaDeliveryGated", { defaultValue: "not enabled for restaurant food yet" })})
                    </span>
                  )}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={deliverySuspended} onChange={(e) => setDeliverySuspended(e.target.checked)} />
                  {t("restaurant.deliverySuspended", { defaultValue: "Temporarily suspend delivery" })}
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.feeMode", { defaultValue: "Fee model" })}</span>
                  <select value={feeMode} onChange={(e) => setFeeMode(e.target.value as "fixed" | "distance")} className="w-full rounded-xl border px-3 py-2">
                    <option value="fixed">{t("restaurant.feeFixed", { defaultValue: "Fixed fee" })}</option>
                    <option value="distance">{t("restaurant.feeDistance", { defaultValue: "Distance-based" })}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("restaurant.deliveryFee", { defaultValue: "Base delivery fee" })}</span>
                  <input value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </label>
                {feeMode === "distance" && (
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">{t("restaurant.feePerKm", { defaultValue: "Fee per km" })}</span>
                    <input value={feePerKm} onChange={(e) => setFeePerKm(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </label>
                )}
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
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-semibold">{t("restaurant.deliveryZones", { defaultValue: "Delivery zones / areas (comma-separated)" })}</span>
                  <input value={zones} onChange={(e) => setZones(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="Pétion-Ville, Delmas 33" />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("restaurant.zoneMapNote", {
                      defaultValue: "Zone labels are validated against the customer address. Interactive polygon map can be added when map tiles are configured.",
                    })}
                  </span>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-semibold">{t("restaurant.deliveryInstructions", { defaultValue: "Delivery notes" })}</span>
                  <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="min-h-[80px] w-full rounded-xl border px-3 py-2" />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 dark:bg-[hsl(152,16%,12%)]" data-testid="owner-delivery-staff">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {t("restaurant.deliveryStaff", { defaultValue: "Delivery personnel" })}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("restaurant.deliveryStaffHint", {
                  defaultValue: "Your couriers — no Flexa Driver registration required.",
                })}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder={t("restaurant.staffName", { defaultValue: "Name" })} className="flex-1 rounded-xl border px-3 py-2 text-sm" />
                <input value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} placeholder={t("restaurant.staffPhone", { defaultValue: "Phone" })} className="w-40 rounded-xl border px-3 py-2 text-sm" />
                <button type="button" onClick={() => void addStaff()} className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-xs font-bold text-white">
                  {t("restaurant.addStaff", { defaultValue: "Add" })}
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {staff.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                    <span className="font-semibold">{s.displayName}{s.phone ? ` · ${s.phone}` : ""}</span>
                    <span className="text-xs text-muted-foreground">{s.active ? "Active" : "Inactive"}</span>
                  </li>
                ))}
                {staff.length === 0 && (
                  <li className="text-xs text-muted-foreground">{t("restaurant.noStaff", { defaultValue: "No personnel added yet." })}</li>
                )}
              </ul>
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
