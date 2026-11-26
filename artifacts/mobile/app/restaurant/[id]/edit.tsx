/**
 * Edit restaurant profile — info, address, hours, delivery.
 */
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { fetchRestaurant, updateRestaurant } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import { DEFAULT_SCHEDULE, type DailyScheduleItem } from "@/lib/restaurantTypes";

export default function EditRestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = Number(id);
  const { token } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("HT");
  const [schedule, setSchedule] = useState<DailyScheduleItem[]>(DEFAULT_SCHEDULE);
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [deliveryEta, setDeliveryEta] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(restaurantId)) return;
    setLoading(true);
    try {
      const r = await fetchRestaurant(restaurantId, { token });
      setName(r.name);
      setBio(r.bio || "");
      setCuisine(r.cuisineTags.join(", "));
      setPhone(r.phone || "");
      setAddressLine1(r.addressLine1);
      setAddressLine2(r.addressLine2 || "");
      setCity(r.city);
      setState(r.state || "");
      setPostalCode(r.postalCode || "");
      setCountry(r.country);
      setSchedule(r.schedule?.length ? r.schedule : DEFAULT_SCHEDULE);
      setOffersDelivery(r.offersDelivery);
      setDeliveryFee(r.deliveryFeeUsd != null ? String(r.deliveryFeeUsd) : "");
      setDeliveryEta(r.deliveryEtaMinutes != null ? String(r.deliveryEtaMinutes) : "");
      setDeliveryNotes(r.deliveryNotes || "");
      setIsPublished(r.isPublished);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, restaurantId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async () => {
    if (!token) return;
    if (!name.trim() || !addressLine1.trim() || !city.trim() || !country.trim()) {
      setError("Name, street address, city, and country are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateRestaurant(
        restaurantId,
        {
          name: name.trim(),
          bio: bio.trim() || null,
          cuisineTags: cuisine
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          phone: phone.trim() || null,
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || null,
          city: city.trim(),
          state: state.trim() || null,
          postalCode: postalCode.trim() || null,
          country: country.trim().toUpperCase(),
          schedule,
          offersDelivery,
          deliveryFeeUsd: deliveryFee.trim() ? Number(deliveryFee) : null,
          deliveryEtaMinutes: deliveryEta.trim() ? Number(deliveryEta) : null,
          deliveryNotes: deliveryNotes.trim() || null,
          isPublished,
        },
        { token },
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RestaurantGate>
      <RestaurantShell title="Edit Restaurant" subtitle="Profile · Hours · Delivery">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {loading ? (
            <ActivityIndicator color={T.accent} />
          ) : (
            <>
              <Labeled label="Name" value={name} onChangeText={setName} />
              <Labeled label="Bio" value={bio} onChangeText={setBio} multiline />
              <Labeled label="Cuisine tags" value={cuisine} onChangeText={setCuisine} />
              <Labeled label="Phone" value={phone} onChangeText={setPhone} />
              <Labeled label="Address line 1" value={addressLine1} onChangeText={setAddressLine1} />
              <Labeled label="Address line 2" value={addressLine2} onChangeText={setAddressLine2} />
              <Labeled label="City" value={city} onChangeText={setCity} />
              <Labeled label="State / Region" value={state} onChangeText={setState} />
              <Labeled label="Postal code" value={postalCode} onChangeText={setPostalCode} />
              <Labeled label="Country" value={country} onChangeText={setCountry} />

              <Text style={styles.section}>Hours</Text>
              <ScheduleEditor schedule={schedule} onChange={setSchedule} />

              <View style={styles.toggleRow}>
                <Text style={styles.toggleTitle}>Offers Delivery</Text>
                <Switch
                  value={offersDelivery}
                  onValueChange={setOffersDelivery}
                  trackColor={{ false: "#CBD5E1", true: T.accentSoft }}
                  thumbColor={offersDelivery ? T.forest : "#F8FAFC"}
                />
              </View>
              {offersDelivery ? (
                <>
                  <Labeled label="Delivery fee USD" value={deliveryFee} onChangeText={setDeliveryFee} />
                  <Labeled label="ETA minutes" value={deliveryEta} onChangeText={setDeliveryEta} />
                  <Labeled label="Delivery notes" value={deliveryNotes} onChangeText={setDeliveryNotes} multiline />
                </>
              ) : null}

              <View style={styles.toggleRow}>
                <Text style={styles.toggleTitle}>Published</Text>
                <Switch
                  value={isPublished}
                  onValueChange={setIsPublished}
                  trackColor={{ false: "#CBD5E1", true: T.accentSoft }}
                  thumbColor={isPublished ? T.forest : "#F8FAFC"}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.save, saving && { opacity: 0.7 }]}
                disabled={saving}
                onPress={() => void save()}
              >
                {saving ? (
                  <ActivityIndicator color={T.white} />
                ) : (
                  <Text style={styles.saveText}>Save changes</Text>
                )}
              </Pressable>
            </>
          )}
        </KeyboardAvoidingView>
      </RestaurantShell>
    </RestaurantGate>
  );
}

function Labeled({
  label,
  value,
  onChangeText,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 72, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  section: { marginTop: 8, marginBottom: 8, fontSize: 15, fontWeight: "800", color: T.ink },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    marginVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  toggleTitle: { fontSize: 14, fontWeight: "800", color: T.ink },
  save: {
    marginTop: 12,
    backgroundColor: T.forest,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: T.white, fontWeight: "800" },
  error: { color: T.danger, fontWeight: "600", marginTop: 8 },
});
