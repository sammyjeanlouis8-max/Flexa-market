import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { getApiBase } from "@/lib/api";

export default function DriverApplyScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("motorcycle");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Driver apply" showBrand={false} showBack />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in to apply as a driver.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Apply as driver" showBrand={false} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Text style={styles.label}>City ({country})</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} />
        <Text style={styles.label}>Vehicle</Text>
        <View style={styles.row}>
          {["motorcycle", "car", "bike"].map((v) => (
            <Pressable key={v} style={[styles.chip, vehicle === v && styles.chipOn]} onPress={() => setVehicle(v)}>
              <Text style={[styles.chipText, vehicle === v && styles.chipTextOn]}>{v}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.btn}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            fetch(`${getApiBase()}/delivery/apply`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ phone, city, country, vehicleType: vehicle }),
            })
              .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `Apply failed (${res.status})`);
                Alert.alert("Submitted", "Your driver application was sent.");
                router.push("/driver-dashboard");
              })
              .catch((e) => Alert.alert("Apply failed", String(e.message || e)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Submit application</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  label: { fontWeight: "700", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontWeight: "700", color: "#334155", textTransform: "capitalize" },
  chipTextOn: { color: "#FFF" },
  btn: { marginTop: 16, backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#FFF", fontWeight: "800" },
  msg: { color: "#64748B" },
});
