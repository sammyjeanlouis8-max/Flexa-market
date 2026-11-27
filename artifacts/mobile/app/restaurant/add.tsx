import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { createRestaurant, saveRestaurantDelivery, saveRestaurantHours } from "@/lib/restaurantApi";
import { isRestaurantCountryHardDisabled, restaurantRegistrationCountries } from "@/lib/restaurantCountryPolicy";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const TYPES = [
  { id: "traditional", label: "Restaurants" },
  { id: "food_truck", label: "Food Trucks" },
  { id: "home_kitchen", label: "Home Kitchens" },
];

const COUNTRIES = restaurantRegistrationCountries([
  "Haiti",
  "Dominican Republic",
  "Jamaica",
  "Mexico",
  "Brazil",
]);

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
  fulfillment: "pickup" | "delivery" | "both";
  openTime: string;
  closeTime: string;
  identityAck: boolean;
  foodAck: boolean;
  termsAck: boolean;
};

export default function RestaurantAddScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const defaultCountry =
    user?.country && !isRestaurantCountryHardDisabled(user.country) ? user.country : "Haiti";

  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    businessType: "traditional",
    description: "",
    country: defaultCountry,
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
    identityAck: false,
    foodAck: false,
    termsAck: false,
  });

  useEffect(() => {
    void AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        setForm((f) => ({ ...f, ...parsed.form }));
        if (typeof parsed.step === "number") setStep(parsed.step);
      } catch {
        /* ignore */
      }
    });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step }));
    }, 400);
    return () => clearTimeout(id);
  }, [form, step]);

  function basicsOk() {
    return (
      form.name.trim().length >= 2
      && !!form.businessType
      && !!form.cuisineTags.trim()
      && !!form.country.trim()
      && !!form.region.trim()
      && !!form.city.trim()
      && !!form.streetAddress.trim()
      && !!form.description.trim()
      && !!form.phone.trim()
    );
  }

  function canAdvance() {
    if (step === 0) return basicsOk();
    if (step === 1) return !!form.fulfillment;
    if (step === 2) return form.identityAck;
    if (step === 3) return form.foodAck && form.termsAck;
    return true;
  }

  function next() {
    setAttempted(true);
    if (!canAdvance()) {
      setError(t("restaurant_completeRequiredFields") || "Complete required fields before continuing.");
      return;
    }
    setError(null);
    setAttempted(false);
    setStep((s) => Math.min(4, s + 1));
  }

  async function onCreate() {
    setAttempted(true);
    if (!canAdvance() || !token) {
      setError(t("restaurant_completeRequiredFields") || "Complete required fields before continuing.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await createRestaurant(
        {
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
        },
        { token },
      );
      const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isClosed: false,
        openTime: form.openTime,
        closeTime: form.closeTime,
        overnight: false,
      }));
      await saveRestaurantHours(r.id, hours, { token });
      await saveRestaurantDelivery(
        r.id,
        {
          fulfillment: form.fulfillment,
          ownerManagedDelivery: true,
          usesFlexaDrivers: false,
          deliveryFee: 0,
          deliveryInstructions: "Delivery is managed directly by this business.",
        },
        { token },
      );
      await AsyncStorage.removeItem(DRAFT_KEY);
      router.replace(`/restaurant/owner?rid=${r.id}` as any);
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  const showBasicsErr = attempted && step === 0;

  return (
    <RestaurantShell title={t("restaurant_addRestaurantTitle")} subtitle={t("restaurant_addRestaurantSubtitle")}>
      <Text style={styles.note}>{t("restaurant_driverPolicyNote")}</Text>
      <Text style={styles.note}>{t("restaurant_deliveryManagedByBusiness")}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps}>
        {["Basics", "Hours", "Identity", "Safety", "Review"].map((label, i) => (
          <Pressable key={label} style={[styles.stepChip, step === i && styles.stepChipOn]} onPress={() => setStep(i)}>
            <Text style={[styles.stepChipText, step === i && styles.stepChipTextOn]} numberOfLines={1}>
              {i + 1}. {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {step === 0 && (
        <View style={styles.block}>
          <Text style={styles.label}>Business category</Text>
          <View style={styles.row}>
            {TYPES.map((ty) => (
              <Pressable
                key={ty.id}
                style={[styles.chip, form.businessType === ty.id && styles.chipOn]}
                onPress={() => setForm((f) => ({ ...f, businessType: ty.id }))}
              >
                <Text style={[styles.chipText, form.businessType === ty.id && styles.chipTextOn]}>{ty.label}</Text>
              </Pressable>
            ))}
          </View>
          <Input label="Business name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={showBasicsErr && form.name.trim().length < 2} />
          <Input label="Cuisine type" value={form.cuisineTags} onChange={(v) => setForm((f) => ({ ...f, cuisineTags: v }))} error={showBasicsErr && !form.cuisineTags.trim()} />
          <Input label="Description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} multiline error={showBasicsErr && !form.description.trim()} />
          <Text style={styles.label}>Country (US/CA disabled)</Text>
          <View style={styles.row}>
            {COUNTRIES.map((c) => (
              <Pressable key={c} style={[styles.chip, form.country === c && styles.chipOn]} onPress={() => setForm((f) => ({ ...f, country: c }))}>
                <Text style={[styles.chipText, form.country === c && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Input label="State / department / region" value={form.region} onChange={(v) => setForm((f) => ({ ...f, region: v }))} error={showBasicsErr && !form.region.trim()} />
          <Input label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} error={showBasicsErr && !form.city.trim()} />
          <Input label="Business address" value={form.streetAddress} onChange={(v) => setForm((f) => ({ ...f, streetAddress: v }))} error={showBasicsErr && !form.streetAddress.trim()} />
          <Input label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} error={showBasicsErr && !form.phone.trim()} />
          <Input label="Logo image URL" value={form.logoUrl} onChange={(v) => setForm((f) => ({ ...f, logoUrl: v }))} />
          <Input label="Cover image URL" value={form.coverUrl} onChange={(v) => setForm((f) => ({ ...f, coverUrl: v }))} />
          {form.logoUrl ? <Image source={{ uri: form.logoUrl }} style={styles.preview} /> : null}
        </View>
      )}

      {step === 1 && (
        <View style={styles.block}>
          <Text style={styles.label}>Fulfillment</Text>
          <View style={styles.row}>
            {(["pickup", "delivery", "both"] as const).map((f) => (
              <Pressable key={f} style={[styles.chip, form.fulfillment === f && styles.chipOn]} onPress={() => setForm((x) => ({ ...x, fulfillment: f }))}>
                <Text style={[styles.chipText, form.fulfillment === f && styles.chipTextOn]}>{f}</Text>
              </Pressable>
            ))}
          </View>
          <Input label="Opens" value={form.openTime} onChange={(v) => setForm((f) => ({ ...f, openTime: v }))} />
          <Input label="Closes" value={form.closeTime} onChange={(v) => setForm((f) => ({ ...f, closeTime: v }))} />
        </View>
      )}

      {step === 2 && (
        <View style={styles.block}>
          <Text style={styles.p}>{t("restaurant_identityPrivacyBody")}</Text>
          <Pressable style={styles.row} onPress={() => setForm((f) => ({ ...f, identityAck: !f.identityAck }))}>
            <Text style={{ fontSize: 18 }}>{form.identityAck ? "☑" : "☐"}</Text>
            <Text style={[styles.p, { flex: 1, marginBottom: 0 }]}>I understand identity docs stay private and publishing requires verification.</Text>
          </Pressable>
        </View>
      )}

      {step === 3 && (
        <View style={styles.block}>
          <Pressable style={styles.row} onPress={() => setForm((f) => ({ ...f, foodAck: !f.foodAck }))}>
            <Text style={{ fontSize: 18 }}>{form.foodAck ? "☑" : "☐"}</Text>
            <Text style={[styles.p, { flex: 1, marginBottom: 0 }]}>{t("restaurant_foodResponsibilityAck")}</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => setForm((f) => ({ ...f, termsAck: !f.termsAck }))}>
            <Text style={{ fontSize: 18 }}>{form.termsAck ? "☑" : "☐"}</Text>
            <Text style={[styles.p, { flex: 1, marginBottom: 0 }]}>I accept the food safety terms</Text>
          </Pressable>
        </View>
      )}

      {step === 4 && (
        <View style={styles.block}>
          <Text style={styles.title}>{form.name}</Text>
          <Text style={styles.muted}>
            {form.businessType} · {form.city}, {form.region}, {form.country}
          </Text>
          <Text style={styles.p}>{form.description}</Text>
          <Text style={styles.muted}>{form.phone} · {form.fulfillment}</Text>
          <Text style={styles.note}>
            Application saves as draft. Publishing requires identity, food safety, and Super Admin approval.
          </Text>
        </View>
      )}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <View style={styles.row}>
        {step > 0 ? (
          <Pressable style={styles.secondary} onPress={() => { setError(null); setAttempted(false); setStep((s) => s - 1); }}>
            <Text style={styles.secondaryText}>{t("common_back") || "Back"}</Text>
          </Pressable>
        ) : null}
        {step < 4 ? (
          <Pressable style={styles.btn} onPress={next}>
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

function Input({
  label,
  value,
  onChange,
  multiline,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  error?: boolean;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={T.muted}
        style={[styles.input, multiline && { minHeight: 80 }, error && { borderColor: "#b91c1c" }]}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 8, lineHeight: 17 },
  p: { fontSize: 14, color: T.ink, lineHeight: 20, marginBottom: 12 },
  block: { marginBottom: 12 },
  title: { fontWeight: "900", color: T.ink, fontSize: 16 },
  muted: { fontSize: 12, color: T.muted, marginTop: 4, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: "800", color: T.muted, marginBottom: 6, textTransform: "uppercase" },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    padding: 12,
    color: T.ink,
  },
  steps: { flexDirection: "row", flexWrap: "nowrap", gap: 6, marginBottom: 12 },
  stepChip: {
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  stepChipOn: { backgroundColor: T.accent, borderColor: T.accent },
  stepChipText: { fontSize: 11, fontWeight: "800", color: T.ink },
  stepChipTextOn: { color: T.white },
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
  preview: { width: 72, height: 72, borderRadius: 12, marginTop: 4 },
});
