import { useLanguage } from "@/context/LanguageContext";
/**
 * Multi-warehouse management — residential address is NOT used for selling.
 * Sellers living abroad can sell in a country only with a verified warehouse there.
 */
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  createWarehouse,
  fetchWarehouses,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const emptyForm = () => ({
  name: "",
  country: "",
  region: "",
  city: "",
  address: "",
  latitude: "" as string,
  longitude: "" as string,
});

export default function WholesaleSellerWarehousesScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchWarehouses({ mine: true, verified: false }, { token });
      setRows(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const useGps = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location",
          "Permission denied. Enter warehouse address manually — selling still works after admin verifies the depot.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const place = places[0];
      setForm((f) => ({
        ...f,
        latitude: String(pos.coords.latitude),
        longitude: String(pos.coords.longitude),
        country: place?.country || f.country,
        region: place?.region || place?.subregion || f.region,
        city: place?.city || place?.subregion || f.city,
        address: [place?.streetNumber, place?.street].filter(Boolean).join(" ") || f.address,
      }));
    } catch (e: any) {
      Alert.alert("Location", e?.message || "Could not read GPS — enter manually.");
    } finally {
      setLocBusy(false);
    }
  };

  const onSave = async () => {
    if (!token) return;
    if (form.name.trim().length < 2 || !form.country.trim() || !form.city.trim()) {
      Alert.alert("Required", "Name, country, and city are required.");
      return;
    }
    setSaving(true);
    try {
      await createWarehouse(
        {
          name: form.name.trim(),
          country: form.country.trim(),
          region: form.region.trim() || null,
          city: form.city.trim(),
          address: form.address.trim(),
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        },
        { token },
      );
      setForm(emptyForm());
      setShowForm(false);
      await load();
      Alert.alert(
        "Submitted",
        "Warehouse registered as pending. An admin must verify it before you can publish products in that country.",
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save warehouse");
    } finally {
      setSaving(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "verified") return T.accent;
    if (s === "rejected") return T.danger;
    return T.warn;
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title={t("wholesale_myDepotTitle")}
        subtitle="Separate from your home address · multi-country depots"
        headerRight={
          <Pressable style={styles.addBtn} onPress={() => setShowForm((v) => !v)} testID="wholesale-add-warehouse">
            <Feather name="plus" size={14} color={T.forest} />
            <Text style={styles.addBtnText}>{showForm ? "Close" : "Add"}</Text>
          </Pressable>
        }
      >
        <View style={styles.note}>
          <Feather name="info" size={14} color={T.forest} />
          <Text style={styles.noteText}>
            Your residential country ({user?.country || "profile"}) is not used for selling.
            Example: live in the US, sell in Haiti after a Haiti warehouse is verified.
          </Text>
        </View>

        {showForm ? (
          <View style={styles.form}>
            <Text style={styles.section}>Register warehouse</Text>
            <Pressable style={styles.gpsBtn} onPress={() => void useGps()} disabled={locBusy}>
              {locBusy ? <ActivityIndicator color={T.forest} /> : <Feather name="map-pin" size={16} color={T.forest} />}
              <Text style={styles.gpsText}>Use GPS (optional)</Text>
            </Pressable>
            <Field label="Warehouse name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Delmas Depot" />
            <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} placeholder="Haiti" />
            <Field label="Region / state" value={form.region} onChange={(v) => setForm({ ...form, region: v })} placeholder="Ouest" />
            <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="Port-au-Prince" />
            <Field label="Full address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Route de Delmas 33" />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Field label="Latitude" value={form.latitude} onChange={(v) => setForm({ ...form, latitude: v })} placeholder="18.55" keyboard="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Longitude" value={form.longitude} onChange={(v) => setForm({ ...form, longitude: v })} placeholder="-72.30" keyboard="decimal-pad" />
              </View>
            </View>
            <Pressable
              style={[styles.save, saving && { opacity: 0.7 }]}
              onPress={() => void onSave()}
              disabled={saving}
              testID="wholesale-save-warehouse"
            >
              {saving ? <ActivityIndicator color={T.white} /> : <Text style={styles.saveText}>Submit for verification</Text>}
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="home" size={28} color={T.accent} />
            <Text style={styles.emptyTitle}>No warehouses yet</Text>
            <Text style={styles.emptyBody}>
              Add a depot in each country where you sell. Publish is blocked until that depot is verified.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((w) => (
              <View key={w.id} style={styles.card} testID={`wholesale-warehouse-${w.id}`}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{w.name}</Text>
                  <View style={[styles.badge, { backgroundColor: statusColor(w.verificationStatus) + "22" }]}>
                    <Text style={[styles.badgeText, { color: statusColor(w.verificationStatus) }]}>
                      {w.verificationStatus}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {w.city}
                  {w.region ? `, ${w.region}` : ""} · {w.country}
                </Text>
                {w.address ? <Text style={styles.meta}>{w.address}</Text> : null}
                {w.latitude != null && w.longitude != null ? (
                  <Text style={styles.coords}>
                    GPS {w.latitude.toFixed(4)}, {w.longitude.toFixed(4)}
                  </Text>
                ) : (
                  <Text style={styles.coords}>No GPS — manual address</Text>
                )}
                {w.verificationStatus === "rejected" && w.rejectionReason ? (
                  <Text style={styles.reject}>{w.rejectionReason}</Text>
                ) : null}
                {w.verificationStatus === "verified" ? (
                  <Text style={styles.ok}>You can publish products for {w.country} from this depot.</Text>
                ) : w.verificationStatus === "pending" ? (
                  <Text style={styles.pending}>Awaiting admin verification before publish in {w.country}.</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: "default" | "decimal-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={T.muted}
        style={styles.input}
        keyboardType={keyboard || "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: T.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  addBtnText: { fontSize: 12, fontWeight: "800", color: T.forest },
  note: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: T.accentSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  noteText: { flex: 1, fontSize: 12, color: T.forest, lineHeight: 17, fontWeight: "600" },
  form: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  section: {
    fontSize: 13,
    fontWeight: "800",
    color: T.ink,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: T.mint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  gpsText: { color: T.forest, fontWeight: "800", fontSize: 13 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: T.muted, marginBottom: 4 },
  input: {
    backgroundColor: T.mintSoft,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: T.ink,
  },
  row2: { flexDirection: "row", gap: 10 },
  save: {
    marginTop: 6,
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: T.white, fontWeight: "800", fontSize: 14 },
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: T.ink },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  meta: { marginTop: 4, fontSize: 13, color: T.muted },
  coords: { marginTop: 6, fontSize: 11, color: T.muted, fontWeight: "600" },
  ok: { marginTop: 8, fontSize: 12, color: T.accent, fontWeight: "700" },
  pending: { marginTop: 8, fontSize: 12, color: T.warn, fontWeight: "700" },
  reject: { marginTop: 8, fontSize: 12, color: T.danger, fontWeight: "600" },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    borderRadius: 16,
    backgroundColor: T.white,
  },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 6, fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  error: { color: T.danger, fontWeight: "700", marginTop: 12 },
});
