import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchRestaurant, saveRestaurantDelivery, saveRestaurantHours, type Restaurant } from "@/lib/restaurantApi";
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
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery" | "both">("pickup");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [eta, setEta] = useState("45");
  const [prep, setPrep] = useState("30");
  const [radiusKm, setRadiusKm] = useState("5");
  const [deliverySuspended, setDeliverySuspended] = useState(false);
  const [zones, setZones] = useState("");
  const [hours, setHours] = useState(
    WEEKDAYS.map((weekday) => ({ weekday, isClosed: false, openTime: "09:00", closeTime: "21:00" })),
  );

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    fetchRestaurant(restaurantId, { token })
      .then((r) => {
        setRestaurant(r);
        if (r.fulfillment === "delivery" || r.fulfillment === "both" || r.fulfillment === "pickup") {
          setFulfillment(r.fulfillment);
        }
        if (r.deliveryFee != null) setDeliveryFee(String(r.deliveryFee));
        if (r.minOrderAmount != null) setMinOrder(String(r.minOrderAmount));
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
    setSaving(true);
    setMsg(null);
    try {
      await saveRestaurantHours(restaurantId, hours, { token });
      await saveRestaurantDelivery(
        restaurantId,
        {
          fulfillment,
          ownerManagedDelivery: true,
          usesFlexaDrivers: false,
          deliveryFee: Number(deliveryFee) || 0,
          minOrderAmount: Number(minOrder) || 0,
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

          <Text style={styles.label}>{t("restaurant_fulfillment") || "Fulfillment"}</Text>
          <View style={styles.row}>
            {(["pickup", "delivery", "both"] as const).map((f) => (
              <Pressable key={f} style={[styles.chip, fulfillment === f && styles.chipOn]} onPress={() => setFulfillment(f)}>
                <Text style={[styles.chipText, fulfillment === f && styles.chipTextOn]}>{f}</Text>
              </Pressable>
            ))}
          </View>

          <Field label="Delivery fee" value={deliveryFee} onChange={setDeliveryFee} />
          <Field label="Minimum order" value={minOrder} onChange={setMinOrder} />
          <Field label="Prep minutes" value={prep} onChange={setPrep} />
          <Field label="Delivery ETA (min)" value={eta} onChange={setEta} />
          <Field label="Delivery radius (km)" value={radiusKm} onChange={setRadiusKm} />
          <Field label="Delivery zones (comma-separated)" value={zones} onChange={setZones} />

          <Pressable style={styles.row} onPress={() => setDeliverySuspended((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{deliverySuspended ? "☑" : "☐"}</Text>
            <Text style={styles.p}>{t("restaurant_suspendDelivery") || "Temporarily suspend delivery"}</Text>
          </Pressable>

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
  label: { fontSize: 11, fontWeight: "800", color: T.muted, marginBottom: 4, textTransform: "uppercase" },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" },
  chip: {
    backgroundColor: T.white,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { fontSize: 12, fontWeight: "800", color: T.ink },
  chipTextOn: { color: T.white },
  p: { flex: 1, color: T.ink, fontSize: 14 },
  hourRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  day: { width: 72, fontWeight: "800", color: T.ink },
  time: {
    width: 72,
    backgroundColor: T.white,
    borderRadius: 8,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    color: T.ink,
    textAlign: "center",
  },
  muted: { color: T.muted },
  btn: {
    marginTop: 12,
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  msg: { marginTop: 10, color: T.accent, fontWeight: "700" },
  err: { color: "#b91c1c" },
});
