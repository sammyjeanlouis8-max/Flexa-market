/**
 * Add Restaurant — multi-step onboarding (info → address → hours → delivery).
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { ScheduleEditor } from "@/components/restaurant/ScheduleEditor";
import { useAuth } from "@/context/AuthContext";
import { canPublishRestaurant } from "@/lib/restaurantAccess";
import { createRestaurant } from "@/lib/restaurantApi";
import { uploadLocalFile } from "@/lib/mediaUpload";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import { DEFAULT_SCHEDULE, type DailyScheduleItem } from "@/lib/restaurantTypes";

const STEPS = ["Info", "Address", "Hours", "Delivery"] as const;

export default function AddRestaurantScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const verified = canPublishRestaurant(user);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [phone, setPhone] = useState("");
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("HT");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [schedule, setSchedule] = useState<DailyScheduleItem[]>(DEFAULT_SCHEDULE);
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [deliveryEta, setDeliveryEta] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [publish, setPublish] = useState(true);

  const cuisineTags = useMemo(
    () =>
      cuisine
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [cuisine],
  );

  if (!verified) {
    return (
      <RestaurantGate>
        <RestaurantShell title="Add Restaurant" subtitle="Verification required">
          <View style={styles.gateCard}>
            <Text style={styles.gateTitle}>Identity verification required</Text>
            <Text style={styles.gateBody}>
              Verify your passport or ID card before creating a restaurant.
            </Text>
            <Pressable
              style={styles.primary}
              onPress={() => router.replace("/restaurant/verify" as never)}
            >
              <Text style={styles.primaryText}>Verify identity</Text>
            </Pressable>
          </View>
        </RestaurantShell>
      </RestaurantGate>
    );
  }

  const pickImage = async (kind: "cover" | "logo") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    if (kind === "cover") {
      setCoverUri(uri);
      setCoverUrl(null);
    } else {
      setLogoUri(uri);
      setLogoUrl(null);
    }
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!name.trim()) return "Restaurant name is required.";
    }
    if (step === 1) {
      if (!addressLine1.trim()) return "Street address is required.";
      if (!city.trim()) return "City is required.";
      if (!country.trim()) return "Country is required.";
    }
    if (step === 2) {
      const openDays = schedule.filter((s) => s.isOpen);
      for (const d of openDays) {
        if (!d.openTime || !d.closeTime || !/^\d{2}:\d{2}$/.test(d.openTime) || !/^\d{2}:\d{2}$/.test(d.closeTime)) {
          return `Set valid HH:mm times for ${d.day}.`;
        }
      }
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      let finalCover = coverUrl;
      let finalLogo = logoUrl;
      if (coverUri && !coverUrl) {
        const up = await uploadLocalFile(coverUri, {
          token,
          contentType: "image/jpeg",
          fileName: "restaurant-cover.jpg",
        });
        finalCover = up.url;
      }
      if (logoUri && !logoUrl) {
        const up = await uploadLocalFile(logoUri, {
          token,
          contentType: "image/jpeg",
          fileName: "restaurant-logo.jpg",
        });
        finalLogo = up.url;
      }
      const created = await createRestaurant(
        {
          name: name.trim(),
          bio: bio.trim() || null,
          cuisineTags,
          phone: phone.trim() || null,
          coverPhotoUrl: finalCover,
          logoUrl: finalLogo,
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || null,
          city: city.trim(),
          state: state.trim() || null,
          postalCode: postalCode.trim() || null,
          country: country.trim().toUpperCase(),
          latitude: latitude.trim() ? Number(latitude) : null,
          longitude: longitude.trim() ? Number(longitude) : null,
          schedule,
          offersDelivery,
          deliveryFeeUsd: deliveryFee.trim() ? Number(deliveryFee) : null,
          deliveryEtaMinutes: deliveryEta.trim() ? Number(deliveryEta) : null,
          deliveryNotes: deliveryNotes.trim() || null,
          isPublished: publish,
        },
        { token },
      );
      router.replace(`/restaurant/${created.id}/menu` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create restaurant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RestaurantGate>
      <RestaurantShell title="Add Restaurant" subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.stepper}>
            {STEPS.map((label, i) => (
              <View key={label} style={[styles.stepDot, i <= step && styles.stepDotOn]}>
                <Text style={[styles.stepDotText, i <= step && styles.stepDotTextOn]}>{i + 1}</Text>
              </View>
            ))}
          </View>

          {step === 0 ? (
            <View style={styles.block}>
              <Field label="Restaurant name *" value={name} onChangeText={setName} placeholder="Chez Marie" />
              <Field
                label="Short bio"
                value={bio}
                onChangeText={setBio}
                placeholder="Home-style Haitian kitchen"
                multiline
              />
              <Field
                label="Cuisine tags (comma-separated)"
                value={cuisine}
                onChangeText={setCuisine}
                placeholder="Creole, Seafood, Grill"
              />
              <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+509 …" keyboardType="phone-pad" />
              <Text style={styles.label}>Cover photo</Text>
              <PhotoPick uri={coverUri} onPick={() => void pickImage("cover")} />
              <Text style={styles.label}>Logo</Text>
              <PhotoPick uri={logoUri} onPick={() => void pickImage("logo")} />
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.block}>
              <Field label="Street address *" value={addressLine1} onChangeText={setAddressLine1} placeholder="12 Rue …" />
              <Field label="Address line 2" value={addressLine2} onChangeText={setAddressLine2} placeholder="Apt / Suite" />
              <Field label="City *" value={city} onChangeText={setCity} placeholder="Port-au-Prince" />
              <Field label="State / Region" value={state} onChangeText={setState} placeholder="Ouest" />
              <Field label="Postal code" value={postalCode} onChangeText={setPostalCode} placeholder="HT6110" />
              <Field label="Country *" value={country} onChangeText={setCountry} placeholder="HT" autoCapitalize="characters" />
              <Field label="Latitude (optional)" value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" />
              <Field label="Longitude (optional)" value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.block}>
              <Text style={styles.help}>Use HH:mm (24h). Overnight windows like 18:00–02:00 are supported.</Text>
              <ScheduleEditor schedule={schedule} onChange={setSchedule} />
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.block}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Offers Delivery</Text>
                  <Text style={styles.help}>{offersDelivery ? "Yes — customers can request delivery" : "No — pickup / dine-in only"}</Text>
                </View>
                <Switch
                  value={offersDelivery}
                  onValueChange={setOffersDelivery}
                  trackColor={{ false: "#CBD5E1", true: T.accentSoft }}
                  thumbColor={offersDelivery ? T.forest : "#F8FAFC"}
                />
              </View>
              {offersDelivery ? (
                <>
                  <Field label="Delivery fee (USD)" value={deliveryFee} onChangeText={setDeliveryFee} keyboardType="decimal-pad" placeholder="2.50" />
                  <Field label="Est. prep + delivery (minutes)" value={deliveryEta} onChangeText={setDeliveryEta} keyboardType="number-pad" placeholder="45" />
                  <Field label="Delivery notes" value={deliveryNotes} onChangeText={setDeliveryNotes} placeholder="Delivers within 5 km" multiline />
                </>
              ) : null}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Publish now</Text>
                  <Text style={styles.help}>Visible in Discover when published</Text>
                </View>
                <Switch
                  value={publish}
                  onValueChange={setPublish}
                  trackColor={{ false: "#CBD5E1", true: T.accentSoft }}
                  thumbColor={publish ? T.forest : "#F8FAFC"}
                />
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.navRow}>
            {step > 0 ? (
              <Pressable style={styles.secondary} onPress={() => setStep((s) => s - 1)}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {step < STEPS.length - 1 ? (
              <Pressable style={styles.primary} onPress={next}>
                <Text style={styles.primaryText}>Continue</Text>
                <Feather name="chevron-right" size={16} color={T.white} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.primary, saving && { opacity: 0.7 }]}
                disabled={saving}
                onPress={() => void submit()}
                testID="restaurant-create-submit"
              >
                {saving ? (
                  <ActivityIndicator color={T.white} />
                ) : (
                  <Text style={styles.primaryText}>Create restaurant</Text>
                )}
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </RestaurantShell>
    </RestaurantGate>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "phone-pad" | "decimal-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

function PhotoPick({ uri, onPick }: { uri: string | null; onPick: () => void }) {
  return (
    <Pressable style={styles.photoPick} onPress={onPick}>
      {uri ? (
        <Image source={{ uri }} style={styles.photo} />
      ) : (
        <View style={styles.photoEmpty}>
          <Feather name="image" size={20} color={T.muted} />
          <Text style={styles.photoEmptyText}>Choose photo</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotOn: { backgroundColor: T.forest, borderColor: T.forest },
  stepDotText: { fontSize: 12, fontWeight: "800", color: T.muted },
  stepDotTextOn: { color: T.white },
  block: { gap: 2 },
  label: { fontSize: 12, fontWeight: "800", color: T.forest, marginBottom: 6 },
  input: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "600",
    color: T.ink,
  },
  help: { fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 12,
  },
  toggleTitle: { fontSize: 14, fontWeight: "800", color: T.ink },
  photoPick: { marginBottom: 12, borderRadius: 12, overflow: "hidden" },
  photo: { width: "100%", height: 140 },
  photoEmpty: {
    height: 100,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  photoEmptyText: { fontSize: 12, fontWeight: "700", color: T.muted },
  navRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  primary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: T.forest,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryText: { color: T.white, fontWeight: "800", fontSize: 14 },
  secondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.white,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: T.line,
  },
  secondaryText: { color: T.ink, fontWeight: "800", fontSize: 14 },
  error: { color: T.danger, fontWeight: "600", marginTop: 10 },
  gateCard: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  gateTitle: { fontSize: 16, fontWeight: "800", color: T.ink },
  gateBody: { marginTop: 8, fontSize: 13, color: T.muted, lineHeight: 18, marginBottom: 14 },
});
