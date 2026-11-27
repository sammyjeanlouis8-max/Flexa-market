import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  createRestaurant,
  saveRestaurantDelivery,
  saveRestaurantHours,
  updateRestaurant,
} from "@/lib/restaurantApi";
import { isRestaurantCountryHardDisabled, restaurantRegistrationCountries } from "@/lib/restaurantCountryPolicy";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const TYPES = [
  { id: "traditional", label: "Restaurant" },
  { id: "home_kitchen", label: "Home Kitchen" },
  { id: "food_truck", label: "Food Truck" },
  { id: "bakery", label: "Bakery" },
  { id: "catering", label: "Catering" },
];

const STEPS = ["Business", "Location", "Hours", "Identity", "Safety", "Review"] as const;

const WEEKDAYS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 0, label: "Sun" },
];

const COUNTRIES = restaurantRegistrationCountries([
  "Haiti",
  "Dominican Republic",
  "Jamaica",
  "Mexico",
  "Brazil",
]);

const DRAFT_KEY = "flexa_restaurant_registration_draft_v2";

type DayHours = {
  weekday: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
};

type FormState = {
  restaurantId: number | null;
  name: string;
  businessType: string;
  description: string;
  country: string;
  region: string;
  city: string;
  streetAddress: string;
  publicPickupAddress: string;
  cuisineTags: string;
  phone: string;
  email: string;
  whatsapp: string;
  logoUrl: string;
  coverUrl: string;
  latitude: string;
  longitude: string;
  fulfillment: "pickup" | "delivery" | "both";
  deliveryZones: string;
  deliveryFee: string;
  dayHours: DayHours[];
  legalName: string;
  identityAck: boolean;
  foodAck: boolean;
  termsAck: boolean;
};

function defaultHours(): DayHours[] {
  return WEEKDAYS.map((d) => ({
    weekday: d.id,
    isClosed: d.id === 0,
    openTime: "08:00",
    closeTime: "20:00",
  }));
}

export default function RestaurantAddScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const defaultCountry =
    user?.country && !isRestaurantCountryHardDisabled(user.country) ? user.country : "Haiti";

  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    restaurantId: null,
    name: "",
    businessType: "traditional",
    description: "",
    country: defaultCountry,
    region: "",
    city: "",
    streetAddress: "",
    publicPickupAddress: "",
    cuisineTags: "",
    phone: "",
    email: "",
    whatsapp: "",
    logoUrl: "",
    coverUrl: "",
    latitude: "",
    longitude: "",
    fulfillment: "pickup",
    deliveryZones: "",
    deliveryFee: "0",
    dayHours: defaultHours(),
    legalName: "",
    identityAck: false,
    foodAck: false,
    termsAck: false,
  });

  useEffect(() => {
    void AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        setForm((f) => ({
          ...f,
          ...parsed.form,
          dayHours: Array.isArray(parsed.form?.dayHours) ? parsed.form.dayHours : f.dayHours,
        }));
        if (typeof parsed.step === "number") setStep(Math.min(5, Math.max(0, parsed.step)));
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

  function infoOk() {
    return (
      form.name.trim().length >= 2
      && !!form.businessType
      && !!form.cuisineTags.trim()
      && !!form.description.trim()
      && !!form.phone.trim()
      && (!!form.logoUrl || !!form.coverUrl)
    );
  }

  function locationOk() {
    return (
      !!form.country.trim()
      && !!form.region.trim()
      && !!form.city.trim()
      && !!form.streetAddress.trim()
      && (form.businessType === "home_kitchen" || !!form.publicPickupAddress.trim())
    );
  }

  function hoursOk() {
    const openDays = form.dayHours.filter((d) => !d.isClosed);
    if (!form.fulfillment || openDays.length === 0) return false;
    if ((form.fulfillment === "delivery" || form.fulfillment === "both") && !form.deliveryZones.trim()) {
      return false;
    }
    return openDays.every((d) => d.openTime && d.closeTime);
  }

  function canAdvance() {
    if (step === 0) return infoOk();
    if (step === 1) return locationOk();
    if (step === 2) return hoursOk();
    if (step === 3) return form.identityAck && form.legalName.trim().length >= 2;
    if (step === 4) return form.foodAck && form.termsAck;
    return true;
  }

  async function pickImage(kind: "logo" | "cover") {
    if (!token) {
      setError("Sign in required");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission required");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: kind === "logo" ? [1, 1] : [16, 9],
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploading(kind);
    setError(null);
    try {
      const uploaded = await uploadLocalFile(result.assets[0].uri, {
        token,
        contentType: "image/jpeg",
        fileName: kind === "logo" ? "logo.jpg" : "cover.jpg",
      });
      setForm((f) => ({ ...f, [kind === "logo" ? "logoUrl" : "coverUrl"]: uploaded.url }));
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function useCurrentLocation() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setError("Location permission required");
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setForm((f) => ({
      ...f,
      latitude: String(pos.coords.latitude.toFixed(6)),
      longitude: String(pos.coords.longitude.toFixed(6)),
    }));
  }

  async function ensureDraft(tok: string): Promise<number> {
    if (form.restaurantId) return form.restaurantId;
    const homeKitchen = form.businessType === "home_kitchen";
    const r = await createRestaurant(
      {
        name: form.name.trim(),
        businessType: form.businessType,
        description: form.description.trim(),
        country: form.country,
        region: form.region.trim(),
        city: form.city.trim(),
        streetAddress: form.streetAddress.trim(),
        publicPickupAddress: form.publicPickupAddress.trim() || undefined,
        privateResidentialAddress: homeKitchen ? form.streetAddress.trim() : undefined,
        showPublicAddress: !homeKitchen,
        cuisineTags: form.cuisineTags.split(",").map((s) => s.trim()).filter(Boolean),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim() || undefined,
        contactEmail: form.email.trim() || undefined,
        logoUrl: form.logoUrl || undefined,
        coverUrl: form.coverUrl || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        fulfillment: form.fulfillment,
      },
      { token: tok },
    );
    setForm((f) => ({ ...f, restaurantId: r.id }));
    return r.id;
  }

  async function persistHours(id: number, tok: string) {
    await saveRestaurantHours(
      id,
      form.dayHours.map((d) => ({
        weekday: d.weekday,
        isClosed: d.isClosed,
        openTime: d.openTime,
        closeTime: d.closeTime,
        overnight: d.openTime > d.closeTime,
      })),
      { token: tok },
    );
    await saveRestaurantDelivery(
      id,
      {
        fulfillment: form.fulfillment,
        ownerManagedDelivery: true,
        usesFlexaDrivers: false,
        deliveryFee: Number(form.deliveryFee) || 0,
        deliveryZones: form.deliveryZones.split(",").map((s) => s.trim()).filter(Boolean),
        deliveryInstructions: "Delivery is managed directly by this business.",
      },
      { token: tok },
    );
  }

  async function next() {
    setAttempted(true);
    if (!canAdvance()) {
      setError(t("restaurant_completeRequiredFields") || "Complete required fields before continuing.");
      return;
    }
    setError(null);
    setAttempted(false);
    if (step === 2 && token) {
      setSaving(true);
      try {
        const id = await ensureDraft(token);
        await persistHours(id, token);
      } catch (e: any) {
        setError(e?.message || "Could not save draft");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    setStep((s) => Math.min(5, s + 1));
  }

  async function onSubmit() {
    setAttempted(true);
    if (!canAdvance() || !token) {
      setError(t("restaurant_completeRequiredFields") || "Complete required fields before continuing.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await ensureDraft(token);
      await persistHours(id, token);
      await updateRestaurant(
        id,
        { submit: true, foodResponsibilityAccepted: true },
        { token },
      );
      await AsyncStorage.removeItem(DRAFT_KEY);
      router.replace(`/restaurant/owner?rid=${id}` as any);
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  const showErr = attempted;

  return (
    <RestaurantShell title={t("restaurant_addRestaurantTitle")} subtitle={t("restaurant_addRestaurantSubtitle")}>
      <Text style={styles.note}>{t("restaurant_deliveryManagedByBusiness")}</Text>
      <Text style={styles.stepLabel}>
        {t("restaurant_stepOf") || `Step ${step + 1} of ${STEPS.length}`} · {STEPS[step]}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps}>
        {STEPS.map((label, i) => (
          <Pressable
            key={label}
            style={[styles.stepChip, step === i && styles.stepChipOn]}
            onPress={() => { if (i <= step) setStep(i); }}
          >
            <Text style={[styles.stepChipText, step === i && styles.stepChipTextOn]} numberOfLines={1}>
              {i + 1}. {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {step === 0 && (
        <View style={styles.block} testID="restaurant-basics-form">
          <Text style={styles.label}>Business category *</Text>
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
          <Input label="Business name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={showErr && form.name.trim().length < 2} />
          <Input label="Cuisine type *" value={form.cuisineTags} onChange={(v) => setForm((f) => ({ ...f, cuisineTags: v }))} error={showErr && !form.cuisineTags.trim()} />
          <Input label="Description *" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} multiline error={showErr && !form.description.trim()} />
          <Input label="Business phone *" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} error={showErr && !form.phone.trim()} />
          <Input label="Business email (optional)" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />

          <Text style={styles.label}>Business logo (1:1)</Text>
          <View style={styles.row}>
            <Pressable style={styles.chip} onPress={() => void pickImage("logo")} disabled={!!uploading}>
              <Text style={styles.chipText}>{uploading === "logo" ? "Uploading…" : form.logoUrl ? "Replace logo" : "Upload logo"}</Text>
            </Pressable>
            {form.logoUrl ? <Image source={{ uri: form.logoUrl }} style={styles.preview} /> : null}
          </View>
          <Text style={styles.label}>Cover photo (16:9)</Text>
          <View style={styles.row}>
            <Pressable style={styles.chip} onPress={() => void pickImage("cover")} disabled={!!uploading}>
              <Text style={styles.chipText}>{uploading === "cover" ? "Uploading…" : form.coverUrl ? "Replace cover" : "Upload cover"}</Text>
            </Pressable>
            {form.coverUrl ? <Image source={{ uri: form.coverUrl }} style={styles.previewWide} /> : null}
          </View>
          {showErr && !form.logoUrl && !form.coverUrl ? (
            <Text style={styles.err}>Add a logo or cover photo</Text>
          ) : null}
        </View>
      )}

      {step === 1 && (
        <View style={styles.block}>
          <Text style={styles.label}>Country * (US/CA unavailable)</Text>
          <View style={styles.row}>
            {COUNTRIES.map((c) => (
              <Pressable key={c} style={[styles.chip, form.country === c && styles.chipOn]} onPress={() => setForm((f) => ({ ...f, country: c }))}>
                <Text style={[styles.chipText, form.country === c && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Input label="Department / state *" value={form.region} onChange={(v) => setForm((f) => ({ ...f, region: v }))} error={showErr && !form.region.trim()} />
          <Input label="City / commune *" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} error={showErr && !form.city.trim()} />
          <Input
            label={form.businessType === "home_kitchen" ? "Private home address * (never public)" : "Business address *"}
            value={form.streetAddress}
            onChange={(v) => setForm((f) => ({ ...f, streetAddress: v }))}
            error={showErr && !form.streetAddress.trim()}
          />
          <Input
            label={form.businessType === "home_kitchen" ? "Pickup / meeting point (optional)" : "Pickup address *"}
            value={form.publicPickupAddress}
            onChange={(v) => setForm((f) => ({ ...f, publicPickupAddress: v }))}
            error={showErr && form.businessType !== "home_kitchen" && !form.publicPickupAddress.trim()}
          />
          <Input label="WhatsApp (optional)" value={form.whatsapp} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} />
          <Pressable style={styles.chip} onPress={() => void useCurrentLocation()}>
            <Text style={styles.chipText}>Use current location</Text>
          </Pressable>
          {(form.latitude || form.longitude) ? (
            <Text style={styles.muted}>{form.latitude}, {form.longitude}</Text>
          ) : null}
          {form.businessType === "home_kitchen" ? (
            <Text style={styles.note}>{t("restaurant_homeKitchenPrivacy")}</Text>
          ) : null}
        </View>
      )}

      {step === 2 && (
        <View style={styles.block}>
          <Text style={styles.note}>{t("restaurant_driverPolicyNote")}</Text>
          <Text style={styles.label}>Fulfillment *</Text>
          <View style={styles.row}>
            {(["pickup", "delivery", "both"] as const).map((f) => (
              <Pressable key={f} style={[styles.chip, form.fulfillment === f && styles.chipOn]} onPress={() => setForm((x) => ({ ...x, fulfillment: f }))}>
                <Text style={[styles.chipText, form.fulfillment === f && styles.chipTextOn]}>{f}</Text>
              </Pressable>
            ))}
          </View>
          {WEEKDAYS.map((wd) => {
            const day = form.dayHours.find((d) => d.weekday === wd.id)!;
            return (
              <View key={wd.id} style={styles.dayCard}>
                <View style={styles.row}>
                  <Text style={[styles.label, { marginBottom: 0, flex: 1 }]}>{wd.label}</Text>
                  <Pressable
                    onPress={() =>
                      setForm((f) => ({
                        ...f,
                        dayHours: f.dayHours.map((d) =>
                          d.weekday === wd.id ? { ...d, isClosed: !d.isClosed } : d,
                        ),
                      }))
                    }
                  >
                    <Text style={styles.chipText}>{day.isClosed ? "Closed" : "Open"}</Text>
                  </Pressable>
                </View>
                {!day.isClosed ? (
                  <View style={styles.timeRow}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Opens"
                        value={day.openTime}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            dayHours: f.dayHours.map((d) =>
                              d.weekday === wd.id ? { ...d, openTime: v } : d,
                            ),
                          }))
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Closes"
                        value={day.closeTime}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            dayHours: f.dayHours.map((d) =>
                              d.weekday === wd.id ? { ...d, closeTime: v } : d,
                            ),
                          }))
                        }
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
          {(form.fulfillment === "delivery" || form.fulfillment === "both") ? (
            <>
              <Input
                label="Delivery zones *"
                value={form.deliveryZones}
                onChange={(v) => setForm((f) => ({ ...f, deliveryZones: v }))}
                error={showErr && !form.deliveryZones.trim()}
              />
              <Input label="Delivery fee" value={form.deliveryFee} onChange={(v) => setForm((f) => ({ ...f, deliveryFee: v }))} />
            </>
          ) : null}
        </View>
      )}

      {step === 3 && (
        <View style={styles.block}>
          <Text style={styles.p}>{t("restaurant_identityPrivacyBody")}</Text>
          <Input label="Owner’s legal name *" value={form.legalName} onChange={(v) => setForm((f) => ({ ...f, legalName: v }))} error={showErr && form.legalName.trim().length < 2} />
          <Pressable style={styles.row} onPress={() => setForm((f) => ({ ...f, identityAck: !f.identityAck }))}>
            <Text style={{ fontSize: 18 }}>{form.identityAck ? "☑" : "☐"}</Text>
            <Text style={[styles.p, { flex: 1, marginBottom: 0 }]}>
              I understand identity documents stay private and publishing requires verification.
            </Text>
          </Pressable>
        </View>
      )}

      {step === 4 && (
        <View style={styles.block}>
          <Text style={styles.note}>
            Licensing depends on country and business type. Identity verification is not food safety certification.
          </Text>
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

      {step === 5 && (
        <View style={styles.block}>
          {form.coverUrl ? <Image source={{ uri: form.coverUrl }} style={styles.coverPreview} /> : null}
          <View style={styles.row}>
            {form.logoUrl ? <Image source={{ uri: form.logoUrl }} style={styles.preview} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{form.name}</Text>
              <Text style={styles.muted}>
                {form.businessType} · {form.cuisineTags}
              </Text>
            </View>
          </View>
          <Text style={styles.p}>{form.description}</Text>
          <Text style={styles.muted}>
            {form.city}, {form.region}, {form.country}
          </Text>
          <Text style={styles.muted}>{form.phone} · {form.fulfillment}</Text>
          <Text style={styles.note}>
            Submit places your business Under Review. It will not publish until Super Admin approval.
          </Text>
        </View>
      )}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <View style={[styles.row, { paddingBottom: Math.max(12, insets.bottom) }]}>
        {step > 0 ? (
          <Pressable
            style={styles.secondary}
            onPress={() => {
              setError(null);
              setAttempted(false);
              setStep((s) => s - 1);
            }}
          >
            <Text style={styles.secondaryText}>{t("common_back") || "Back"}</Text>
          </Pressable>
        ) : null}
        {step < 5 ? (
          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void next()}>
            {saving ? (
              <ActivityIndicator color={T.white} />
            ) : (
              <Text style={styles.btnText}>{t("common_continue") || "Continue"}</Text>
            )}
          </Pressable>
        ) : (
          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void onSubmit()}>
            {saving ? (
              <ActivityIndicator color={T.white} />
            ) : (
              <Text style={styles.btnText}>{t("restaurant_submitForReview") || "Submit for review"}</Text>
            )}
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
  stepLabel: { fontSize: 12, fontWeight: "800", color: T.accent, marginBottom: 8 },
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
  steps: { flexDirection: "row", flexWrap: "nowrap", gap: 6, marginBottom: 12, paddingRight: 8 },
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
  timeRow: { flexDirection: "row", gap: 8 },
  dayCard: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
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
  previewWide: { width: 128, height: 72, borderRadius: 12, marginTop: 4 },
  coverPreview: { width: "100%", height: 120, borderRadius: 14, marginBottom: 8 },
});
