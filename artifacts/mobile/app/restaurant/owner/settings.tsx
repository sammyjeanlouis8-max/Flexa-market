import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { NativePhotoField } from "@/components/media/NativePhotoField";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { isValidBusinessPhone } from "@/lib/restaurantContact";
import {
  fetchRestaurant,
  saveRestaurantDelivery,
  saveRestaurantHours,
  updateRestaurant,
  type Restaurant,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function OwnerSettingsScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const { rid } = useLocalSearchParams<{ rid?: string }>();
  const restaurantId = Number(rid) || 0;
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [merchantDeliveryEnabled, setMerchantDeliveryEnabled] = useState(false);
  const [flexaDeliveryEnabled, setFlexaDeliveryEnabled] = useState(false);
  const [flexaFeatureOn, setFlexaFeatureOn] = useState(false);
  const [feeMode, setFeeMode] = useState<"fixed" | "distance">("fixed");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [feePerKm, setFeePerKm] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [freeDeliveryMin, setFreeDeliveryMin] = useState("");
  const [eta, setEta] = useState("45");
  const [prep, setPrep] = useState("30");
  const [radiusKm, setRadiusKm] = useState("5");
  const [deliverySuspended, setDeliverySuspended] = useState(false);
  const [zones, setZones] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [enableWhatsapp, setEnableWhatsapp] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [hours, setHours] = useState(
    WEEKDAYS.map((weekday) => ({ weekday, isClosed: false, openTime: "09:00", closeTime: "21:00" })),
  );

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    fetchRestaurant(restaurantId, { token })
      .then((r) => {
        setRestaurant(r);
        setPhone(r.phone || "");
        setWhatsapp(r.whatsapp || "");
        setEnableWhatsapp(Boolean(r.whatsapp));
        setLogoUrl(r.logoUrl || "");
        setCoverUrl(r.coverUrl || "");
        setPickupEnabled(r.pickupAvailable !== false);
        setMerchantDeliveryEnabled(!!((r as any).merchantDeliveryEnabled ?? r.deliveryAvailable));
        setFlexaDeliveryEnabled(!!(r as any).flexaDeliveryEnabled);
        setFlexaFeatureOn(!!(r as any).flexaDeliveryFeatureEnabled);
        if ((r as any).feeMode === "distance") setFeeMode("distance");
        if (r.deliveryFee != null) setDeliveryFee(String(r.deliveryFee));
        if ((r as any).feePerKm != null) setFeePerKm(String((r as any).feePerKm));
        if (r.minOrderAmount != null) setMinOrder(String(r.minOrderAmount));
        if ((r as any).freeDeliveryMin != null) setFreeDeliveryMin(String((r as any).freeDeliveryMin));
        if (r.estimatedDeliveryMinutes != null) setEta(String(r.estimatedDeliveryMinutes));
        if (r.estimatedPrepMinutes != null) setPrep(String(r.estimatedPrepMinutes));
        if ((r as any).deliveryRadiusKm != null) setRadiusKm(String((r as any).deliveryRadiusKm));
        if (r.deliverySuspended != null) setDeliverySuspended(!!r.deliverySuspended);
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
      .catch(() => setRestaurant(null))
      .finally(() => setLoading(false));
  }, [restaurantId, token]);

  async function save() {
    if (!restaurantId || !token) return;
    if (!isValidBusinessPhone(phone)) {
      setMsg("Enter a valid public business phone with country code.");
      return;
    }
    if (enableWhatsapp && whatsapp.trim() && !isValidBusinessPhone(whatsapp)) {
      setMsg("Invalid WhatsApp number.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const fulfillment =
        pickupEnabled && merchantDeliveryEnabled
          ? "both"
          : merchantDeliveryEnabled
            ? "delivery"
            : "pickup";
      await updateRestaurant(
        restaurantId,
        {
          phone: phone.trim(),
          whatsapp: enableWhatsapp && whatsapp.trim() ? whatsapp.trim() : null,
          logoUrl: logoUrl || null,
          coverUrl: coverUrl || null,
        },
        { token },
      );
      await saveRestaurantHours(restaurantId, hours, { token });
      await saveRestaurantDelivery(
        restaurantId,
        {
          fulfillment,
          pickupAvailable: pickupEnabled,
          merchantDeliveryEnabled,
          flexaDeliveryEnabled: flexaFeatureOn ? flexaDeliveryEnabled : false,
          ownerManagedDelivery: true,
          usesFlexaDrivers: false,
          feeMode,
          deliveryFee: Number(deliveryFee) || 0,
          feePerKm: Number(feePerKm) || 0,
          minOrderAmount: Number(minOrder) || 0,
          freeDeliveryMin: freeDeliveryMin.trim() ? Number(freeDeliveryMin) : null,
          estimatedDeliveryMinutes: Number(eta) || 45,
          estimatedPrepMinutes: Number(prep) || 30,
          deliveryRadiusKm: Number(radiusKm) || 5,
          deliverySuspended,
          deliveryZones: zones.split(",").map((s) => s.trim()).filter(Boolean),
          deliveryInstructions: "Delivery is managed directly by this business.",
        },
        { token },
      );
      setMsg(t("restaurant_saved") || "Saved");
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantShell title={t("restaurant_businessHours") || "Hours & delivery"} subtitle={t("restaurant_deliverySettings") || ""}>
      {loading ? (
        <ActivityIndicator color={T.accent} />
      ) : !restaurant ? (
        <Text style={styles.err}>{t("restaurant_notFound")}</Text>
      ) : (
        <>
          <Text style={styles.note}>{t("restaurant_deliveryManagedByBusiness")}</Text>
          <Text style={styles.policy}>{t("restaurant_driverPolicyNote")}</Text>

          <Text style={styles.label}>{t("restaurant_brandPhotos") || "Logo & cover"}</Text>
          <NativePhotoField
            token={token}
            value={logoUrl ? [logoUrl] : []}
            onChange={(urls) => setLogoUrl(urls[0] || "")}
            max={1}
            allowsEditing
            aspect={[1, 1]}
            label={t("restaurant_logo") || "Business logo"}
            testID="restaurant-settings-logo"
          />
          <NativePhotoField
            token={token}
            value={coverUrl ? [coverUrl] : []}
            onChange={(urls) => setCoverUrl(urls[0] || "")}
            max={1}
            allowsEditing
            aspect={[16, 9]}
            label={t("restaurant_cover") || "Cover photo"}
            testID="restaurant-settings-cover"
          />

          <Text style={styles.label}>{t("restaurant_publicContact") || "Public contact"}</Text>
          <Text style={styles.policy}>
            Shown for Call / WhatsApp. Never uses private identity-verification phones.
          </Text>
          <Field label="Business phone *" value={phone} onChange={setPhone} />
          <Pressable style={styles.row} onPress={() => setEnableWhatsapp((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{enableWhatsapp ? "☑" : "☐"}</Text>
            <Text style={styles.p}>Show WhatsApp on public profile</Text>
          </Pressable>
          {enableWhatsapp ? <Field label="WhatsApp number" value={whatsapp} onChange={setWhatsapp} /> : null}

          <Text style={styles.label}>Delivery methods</Text>
          <Pressable style={styles.row} onPress={() => setPickupEnabled((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{pickupEnabled ? "☑" : "☐"}</Text>
            <Text style={styles.p}>Customer Pickup</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => setMerchantDeliveryEnabled((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{merchantDeliveryEnabled ? "☑" : "☐"}</Text>
            <Text style={styles.p}>Merchant Delivery (restaurant personnel)</Text>
          </Pressable>
          <Pressable
            style={[styles.row, !flexaFeatureOn && { opacity: 0.5 }]}
            disabled={!flexaFeatureOn}
            onPress={() => setFlexaDeliveryEnabled((v) => !v)}
          >
            <Text style={{ fontSize: 18 }}>{flexaDeliveryEnabled && flexaFeatureOn ? "☑" : "☐"}</Text>
            <Text style={styles.p}>
              Flexa Delivery{!flexaFeatureOn ? " (not enabled for restaurant food yet)" : ""}
            </Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => setDeliverySuspended((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{deliverySuspended ? "☑" : "☐"}</Text>
            <Text style={styles.p}>{t("restaurant_suspendDelivery") || "Temporarily suspend delivery"}</Text>
          </Pressable>

          <Text style={styles.label}>Fee model</Text>
          <View style={styles.row}>
            {(["fixed", "distance"] as const).map((m) => (
              <Pressable key={m} style={[styles.chip, feeMode === m && styles.chipOn]} onPress={() => setFeeMode(m)}>
                <Text style={[styles.chipText, feeMode === m && styles.chipTextOn]}>{m}</Text>
              </Pressable>
            ))}
          </View>

          <Field label="Base delivery fee" value={deliveryFee} onChange={setDeliveryFee} />
          {feeMode === "distance" ? <Field label="Fee per km" value={feePerKm} onChange={setFeePerKm} /> : null}
          <Field label="Minimum order" value={minOrder} onChange={setMinOrder} />
          <Field label="Free delivery from (optional)" value={freeDeliveryMin} onChange={setFreeDeliveryMin} />
          <Field label="Prep minutes" value={prep} onChange={setPrep} />
          <Field label="Delivery ETA (min)" value={eta} onChange={setEta} />
          <Field label="Delivery radius (km)" value={radiusKm} onChange={setRadiusKm} />
          <Field label="Delivery zones (comma-separated)" value={zones} onChange={setZones} />

          <Text style={styles.label}>{t("restaurant_businessHours") || "Business hours"}</Text>
          {hours.map((h, i) => (
            <View key={h.weekday} style={styles.hourRow}>
              <Pressable onPress={() => setHours((prev) => prev.map((x, j) => (j === i ? { ...x, isClosed: !x.isClosed } : x)))}>
                <Text style={styles.day}>
                  {h.isClosed ? "☐" : "☑"} {DAY_LABELS[h.weekday]}
                </Text>
              </Pressable>
              {!h.isClosed ? (
                <>
                  <TextInput
                    value={h.openTime}
                    onChangeText={(v) => setHours((prev) => prev.map((x, j) => (j === i ? { ...x, openTime: v } : x)))}
                    style={styles.time}
                  />
                  <Text style={styles.muted}>–</Text>
                  <TextInput
                    value={h.closeTime}
                    onChangeText={(v) => setHours((prev) => prev.map((x, j) => (j === i ? { ...x, closeTime: v } : x)))}
                    style={styles.time}
                  />
                </>
              ) : (
                <Text style={styles.muted}>Closed</Text>
              )}
            </View>
          ))}

          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void save()}>
            <Text style={styles.btnText}>{saving ? "…" : t("save") || "Save"}</Text>
          </Pressable>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        </>
      )}
    </RestaurantShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} style={styles.input} placeholderTextColor={T.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 6, lineHeight: 17 },
  policy: { fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "800", color: T.ink, marginTop: 10, marginBottom: 4 },
  p: { flex: 1, fontSize: 14, color: T.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(26,107,71,0.08)",
  },
  chipOn: { backgroundColor: T.accent },
  chipText: { fontSize: 12, fontWeight: "800", color: T.accent, textTransform: "capitalize" },
  chipTextOn: { color: "#fff" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.ink,
    backgroundColor: T.white,
  },
  hourRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  day: { width: 72, fontWeight: "700", color: T.ink },
  time: {
    width: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: T.ink,
    textAlign: "center",
  },
  muted: { color: T.muted },
  btn: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "900" },
  msg: { marginTop: 10, color: T.accent, fontWeight: "700" },
  err: { color: "#b91c1c" },
});
