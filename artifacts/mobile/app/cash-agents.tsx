/**
 * Cash agents directory + apply (existing /agents/* APIs).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { applyAsCashAgent, fetchPublicAgents } from "@/lib/phase3lApis";

export default function CashAgentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setAgents(await fetchPublicAgents({ token, onlineOnly }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agents");
    }
  }, [token, onlineOnly]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Cash agents</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.sub}>Online only</Text>
        <Switch value={onlineOnly} onValueChange={setOnlineOnly} />
      </View>
      {agents.map((a) => (
        <View key={a.id} style={styles.card}>
          <Text style={styles.cardTitle}>{a.fullName || a.businessName || a.userName}</Text>
          <Text style={styles.sub}>{[a.city, a.country, a.isOnline ? "online" : "offline"].filter(Boolean).join(" · ")}</Text>
          <Text style={styles.sub}>{a.whatsappNumber || a.phone || ""}</Text>
        </View>
      ))}
      {!agents.length ? <Text style={styles.empty}>No agents found.</Text> : null}
      <Text style={styles.section}>Apply to become an agent</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor="#94A3B8" />
      <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#94A3B8" />
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor="#94A3B8" />
      <Pressable
        style={styles.btn}
        onPress={() =>
          token &&
          void applyAsCashAgent({ fullName, city, phone, whatsappNumber: phone }, { token })
            .then(() => Alert.alert("Cash agents", "Application submitted"))
            .catch((e) => Alert.alert("Cash agents", e.message))
        }
      >
        <Text style={styles.btnText}>Submit application</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  err: { color: "#DC2626" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 4 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  empty: { color: "#94A3B8", textAlign: "center" },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 8 },
  input: { height: 44, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, backgroundColor: "#fff", color: "#0F172A" },
  btn: { backgroundColor: "#F97316", borderRadius: 10, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
});
