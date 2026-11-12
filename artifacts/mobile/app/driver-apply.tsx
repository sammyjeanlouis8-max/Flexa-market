/**
 * Driver application — GET/PUT draft + POST /api/delivery/apply
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

const VEHICLES = ["moto", "compact", "suv", "van", "truck"];

export default function DriverApplyScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    city: "",
    whatsappNumber: "",
    callPhone: "",
    vehicleType: "moto",
    vehicleBrand: "",
    vehicleModel: "",
    licensePlateNumber: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiRequest<any>("/driver/my-application", { token });
      const app = res.application;
      if (app) {
        setStatus(app.status);
        setAdminNote(app.adminNote || app.rejectionReason || null);
        setForm((f) => ({
          ...f,
          firstName: app.firstName || f.firstName,
          lastName: app.lastName || f.lastName,
          city: app.city || f.city,
          vehicleType: app.vehicleType || f.vehicleType,
        }));
      } else {
        setStatus(null);
        const name = (user?.name || "").split(" ");
        setForm((f) => ({
          ...f,
          firstName: name[0] || "",
          lastName: name.slice(1).join(" ") || "",
          callPhone: user?.phone || "",
          whatsappNumber: user?.phone || "",
        }));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load application");
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const saveDraft = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await apiRequest("/delivery/application/draft", { token, method: "PUT", body: form });
      Alert.alert("Draft saved");
      await load();
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!token) return;
    if (!form.firstName.trim() || !form.city.trim() || !(form.callPhone || form.whatsappNumber)) {
      Alert.alert("Missing fields", "First name, city, and phone are required.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/delivery/apply", { token, method: "POST", body: form });
      Alert.alert("Submitted", "Your driver application is under review.");
      await load();
    } catch (e) {
      Alert.alert("Submit failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const locked = status === "pending" || status === "approved";

  return (
    <View style={styles.root}>
      <AppHeader title="Apply as driver" showBack />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {status ? (
            <View style={styles.statusCard}>
              <Text style={styles.status}>Status: {status}</Text>
              {adminNote ? <Text style={styles.note}>{adminNote}</Text> : null}
              {status === "approved" ? (
                <Pressable style={styles.btn} onPress={() => router.push("/driver-dashboard")}>
                  <Text style={styles.btnText}>Open driver dashboard</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.label}>First name</Text>
          <TextInput style={styles.input} editable={!locked} value={form.firstName} onChangeText={(v) => set("firstName", v)} />
          <Text style={styles.label}>Last name</Text>
          <TextInput style={styles.input} editable={!locked} value={form.lastName} onChangeText={(v) => set("lastName", v)} />
          <Text style={styles.label}>City</Text>
          <TextInput style={styles.input} editable={!locked} value={form.city} onChangeText={(v) => set("city", v)} />
          <Text style={styles.label}>WhatsApp</Text>
          <TextInput style={styles.input} editable={!locked} value={form.whatsappNumber} onChangeText={(v) => set("whatsappNumber", v)} keyboardType="phone-pad" />
          <Text style={styles.label}>Call phone</Text>
          <TextInput style={styles.input} editable={!locked} value={form.callPhone} onChangeText={(v) => set("callPhone", v)} keyboardType="phone-pad" />
          <Text style={styles.label}>Vehicle type</Text>
          <View style={styles.chips}>
            {VEHICLES.map((v) => (
              <Pressable
                key={v}
                disabled={locked}
                style={[styles.chip, form.vehicleType === v && styles.chipOn]}
                onPress={() => set("vehicleType", v)}
              >
                <Text style={[styles.chipText, form.vehicleType === v && { color: "#fff" }]}>{v}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Vehicle brand</Text>
          <TextInput style={styles.input} editable={!locked} value={form.vehicleBrand} onChangeText={(v) => set("vehicleBrand", v)} />
          <Text style={styles.label}>Vehicle model</Text>
          <TextInput style={styles.input} editable={!locked} value={form.vehicleModel} onChangeText={(v) => set("vehicleModel", v)} />
          <Text style={styles.label}>License plate</Text>
          <TextInput style={styles.input} editable={!locked} value={form.licensePlateNumber} onChangeText={(v) => set("licensePlateNumber", v)} autoCapitalize="characters" />

          {!locked ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              <Pressable style={[styles.btnGhost, busy && { opacity: 0.6 }]} onPress={() => void saveDraft()} disabled={busy}>
                <Text style={styles.btnGhostText}>Save draft</Text>
              </Pressable>
              <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={() => void submit()} disabled={busy}>
                <Text style={styles.btnText}>{busy ? "Working…" : "Submit application"}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  err: { color: colors.light.destructive, marginBottom: 8 },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 12,
  },
  status: { fontWeight: "800", color: colors.light.text, textTransform: "capitalize" },
  note: { marginTop: 6, color: "#92400E" },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: colors.light.text,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontWeight: "700", color: colors.light.text, textTransform: "capitalize" },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnGhost: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { fontWeight: "800", color: colors.light.text },
});
