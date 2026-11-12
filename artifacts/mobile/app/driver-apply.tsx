/**
 * Native driver application — draft + submit via existing delivery APIs.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchDriverMyApplication, saveDriverDraft, submitDriverApplication } from "@/lib/phase3lApis";

export default function DriverApplyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchDriverMyApplication({ token });
      setStatus(data);
      const app = data.application;
      if (app) {
        setFirstName(app.firstName || "");
        setLastName(app.lastName || "");
        setCity(app.city || "");
        setVehicleType(app.vehicleType || "motorcycle");
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load application");
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  const body = () => ({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    city: city.trim(),
    whatsappNumber: phone.trim(),
    callPhone: phone.trim(),
    vehicleType,
  });

  const save = async (submit: boolean) => {
    if (!token) return;
    if (!firstName.trim() || !lastName.trim() || !city.trim() || !phone.trim()) {
      Alert.alert("Driver apply", "First name, last name, city, and phone are required.");
      return;
    }
    setBusy(true);
    try {
      if (submit) await submitDriverApplication(body(), { token });
      else await saveDriverDraft(body(), { token });
      Alert.alert("Driver apply", submit ? "Submitted for review" : "Draft saved");
      await load();
    } catch (e) {
      Alert.alert("Driver apply", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const app = status?.application;
  const locked = app && ["pending", "approved"].includes(app.status);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Become a driver</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {app ? <Text style={styles.sub}>Status: {app.status}{app.adminNote ? ` · ${app.adminNote}` : ""}</Text> : null}
      {status?.driver ? <Text style={styles.sub}>Driver record: {status.driver.status} · rating {status.driver.rating ?? "—"}</Text> : null}
      {["First name", "Last name", "City", "Phone / WhatsApp"].map((label, i) => {
        const vals = [firstName, lastName, city, phone];
        const setters = [setFirstName, setLastName, setCity, setPhone];
        return (
          <View key={label}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} value={vals[i]} onChangeText={setters[i]} editable={!locked} placeholderTextColor="#94A3B8" placeholder={label} />
          </View>
        );
      })}
      <Text style={styles.label}>Vehicle</Text>
      <View style={styles.row}>
        {["motorcycle", "car"].map((v) => (
          <Pressable key={v} style={[styles.chip, vehicleType === v && styles.chipOn]} disabled={locked} onPress={() => setVehicleType(v)}>
            <Text style={[styles.chipText, vehicleType === v && styles.chipTextOn]}>{v}</Text>
          </Pressable>
        ))}
      </View>
      {!locked ? (
        <View style={styles.row}>
          <Pressable style={styles.btnGhost} disabled={busy} onPress={() => void save(false)}><Text style={styles.btnGhostText}>Save draft</Text></Pressable>
          <Pressable style={styles.btn} disabled={busy} onPress={() => void save(true)}><Text style={styles.btnText}>{busy ? "…" : "Submit"}</Text></Pressable>
        </View>
      ) : null}
      <Pressable onPress={() => router.push("/driver-dashboard")}><Text style={styles.link}>Open driver dashboard →</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  err: { color: "#DC2626" },
  sub: { color: "#64748B", fontSize: 12 },
  label: { fontWeight: "700", color: "#0F172A", marginTop: 4 },
  input: { height: 44, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, backgroundColor: "#fff", color: "#0F172A" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontWeight: "700", color: "#64748B", fontSize: 12 },
  chipTextOn: { color: "#fff" },
  btn: { backgroundColor: "#F97316", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  btnText: { color: "#fff", fontWeight: "800" },
  btnGhost: { backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  btnGhostText: { color: "#0F172A", fontWeight: "700" },
  link: { color: "#F97316", fontWeight: "700", marginTop: 8 },
});
