import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { createRestaurant, saveRestaurantDelivery, saveRestaurantHours } from "@/lib/restaurantApi";
import { isRestaurantCountryHardDisabled, restaurantRegistrationCountries } from "@/lib/restaurantCountryPolicy";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const TYPES = [
  { id: "traditional", label: "Restaurant" },
  { id: "food_truck", label: "Food Truck" },
  { id: "home_kitchen", label: "Home Kitchen" },
  { id: "catering", label: "Catering" },
];

const COUNTRIES = restaurantRegistrationCountries([
  "Haiti",
  "Dominican Republic",
  "Jamaica",
  "Mexico",
  "Brazil",
]);

export default function RestaurantAddScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const defaultCountry =
    user?.country && !isRestaurantCountryHardDisabled(user.country) ? user.country : "Haiti";

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("traditional");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [city, setCity] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [cuisineTags, setCuisineTags] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery" | "both">("pickup");
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    if (!token) {
      setError("Sign in required");
      return;
    }
    if (!ack) {
      setError(t("restaurant_foodResponsibilityAck") || "Acknowledge food responsibility first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await createRestaurant(
        {
          name: name.trim(),
          businessType,
          description,
          country,
          city: city.trim(),
          streetAddress,
          cuisineTags: cuisineTags.split(",").map((s) => s.trim()).filter(Boolean),
          fulfillment,
        },
        { token },
      );
      const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isClosed: false,
        openTime: "08:00",
        closeTime: "20:00",
        overnight: false,
      }));
      await saveRestaurantHours(r.id, hours, { token });
      await saveRestaurantDelivery(
        r.id,
        {
          fulfillment,
          ownerManagedDelivery: true,
          deliveryFee: 0,
          deliveryInstructions: "Delivery is managed directly by this business.",
        },
        { token },
      );
      router.replace(`/restaurant/owner?rid=${r.id}` as any);
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantShell title={t("restaurant_addRestaurantTitle")} subtitle={t("restaurant_addRestaurantSubtitle")}>
      <Text style={styles.note}>{t("restaurant_driverPolicyNote")}</Text>
      <Text style={styles.p}>{t("restaurant_stepBasicsBody")}</Text>

      {step === 0 && (
        <View style={styles.block}>
          <Text style={styles.label}>Business type</Text>
          <View style={styles.row}>
            {TYPES.map((ty) => (
              <Pressable
                key={ty.id}
                style={[styles.chip, businessType === ty.id && styles.chipOn]}
                onPress={() => setBusinessType(ty.id)}
              >
                <Text style={[styles.chipText, businessType === ty.id && styles.chipTextOn]}>{ty.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={T.muted} style={styles.input} />
          <TextInput value={cuisineTags} onChangeText={setCuisineTags} placeholder="Cuisine tags" placeholderTextColor={T.muted} style={styles.input} />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor={T.muted}
            style={[styles.input, { minHeight: 80 }]}
            multiline
          />
        </View>
      )}

      {step === 1 && (
        <View style={styles.block}>
          <Text style={styles.label}>Country (US/CA disabled by policy)</Text>
          <View style={styles.row}>
            {COUNTRIES.map((c) => (
              <Pressable key={c} style={[styles.chip, country === c && styles.chipOn]} onPress={() => setCountry(c)}>
                <Text style={[styles.chipText, country === c && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={T.muted} style={styles.input} />
          <TextInput value={streetAddress} onChangeText={setStreetAddress} placeholder="Address" placeholderTextColor={T.muted} style={styles.input} />
          <Text style={styles.label}>Fulfillment</Text>
          <View style={styles.row}>
            {(["pickup", "delivery", "both"] as const).map((f) => (
              <Pressable key={f} style={[styles.chip, fulfillment === f && styles.chipOn]} onPress={() => setFulfillment(f)}>
                <Text style={[styles.chipText, fulfillment === f && styles.chipTextOn]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={styles.block}>
          <Text style={styles.p}>{t("restaurant_identityPrivacyBody")}</Text>
          <Text style={styles.p}>{t("restaurant_foodResponsibilityAck")}</Text>
          <Pressable style={styles.row} onPress={() => setAck((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{ack ? "☑" : "☐"}</Text>
            <Text style={[styles.p, { flex: 1, marginBottom: 0 }]}>
              I acknowledge food prep, hygiene, packaging, allergens, transport, and delivery responsibility. Flexa Driver does not deliver restaurant food.
            </Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <View style={styles.row}>
        {step > 0 ? (
          <Pressable style={styles.secondary} onPress={() => setStep((s) => s - 1)}>
            <Text style={styles.secondaryText}>{t("common_back") || "Back"}</Text>
          </Pressable>
        ) : null}
        {step < 2 ? (
          <Pressable style={styles.btn} onPress={() => setStep((s) => s + 1)}>
            <Text style={styles.btnText}>{t("common_next") || "Next"}</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void onCreate()}>
            {saving ? <ActivityIndicator color={T.white} /> : <Text style={styles.btnText}>{t("restaurant_addRestaurant")}</Text>}
          </Pressable>
        )}
      </View>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 8, lineHeight: 17 },
  p: { fontSize: 14, color: T.ink, lineHeight: 20, marginBottom: 12 },
  block: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "800", color: T.muted, marginBottom: 6, textTransform: "uppercase" },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    padding: 12,
    color: T.ink,
    marginBottom: 8,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8, alignItems: "center" },
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
  btn: {
    flexGrow: 1,
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  secondary: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.white,
  },
  secondaryText: { fontWeight: "800", color: T.ink },
  err: { color: "#b91c1c", marginBottom: 8 },
});
