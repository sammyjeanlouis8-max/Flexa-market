import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/api";

const TABS = ["overview", "users", "moderation", "finance", "support"] as const;

export default function AdminScreen() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { token, user } = useAuth();
  const [active, setActive] = useState<(typeof TABS)[number]>(
    (TABS as readonly string[]).includes(String(tab)) ? (tab as any) : "overview",
  );
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = !!(user?.isAdmin || user?.isSuperAdmin);

  useEffect(() => {
    if (!token || !allowed) return;
    setLoading(true);
    setError(null);
    const path =
      active === "moderation"
        ? "/admin/operations/queue"
        : active === "users"
          ? "/admin/users?limit=20"
          : active === "finance"
            ? "/admin/transactions?limit=20"
            : active === "support"
              ? "/admin/support/tickets?limit=20"
              : "/admin/stats";
    fetch(`${getApiBase()}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Admin API ${res.status}`);
        setData(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [active, allowed, token]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Admin" showBrand={false} showBack />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in required.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.root}>
        <AppHeader title="Admin" showBrand={false} showBack />
        <View style={styles.center}>
          <Text style={styles.msg}>Admin role required.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Admin Dashboard" showBrand={false} showBack />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t} style={[styles.tab, active === t && styles.tabOn]} onPress={() => setActive(t)}>
            <Text style={[styles.tabText, active === t && styles.tabTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? <ActivityIndicator color={colors.flexaGreen} /> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <Text style={styles.json}>{JSON.stringify(data, null, 2).slice(0, 4000)}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  tabs: { padding: 12, gap: 8 },
  tab: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  tabOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#334155", textTransform: "capitalize" },
  tabTextOn: { color: "#FFF" },
  body: { padding: 16 },
  json: { fontFamily: "monospace", fontSize: 11, color: "#0F172A" },
  msg: { color: "#64748B", textAlign: "center" },
  err: { color: "#B91C1C", marginBottom: 8 },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  btnText: { color: "#FFF", fontWeight: "800" },
});
