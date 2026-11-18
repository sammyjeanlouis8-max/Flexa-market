/**
 * BNPL — GET /api/bnpl/settings, /bnpl/eligibility
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, money } from "@/lib/request";

type Settings = {
  klarnaEnabled?: boolean;
  affirmEnabled?: boolean;
  afterpayEnabled?: boolean;
  minAmountUsd?: number;
  maxAmountUsd?: number;
  platformFeePct?: number;
};

type Eligibility = {
  eligible?: boolean;
  reasons?: string[];
  message?: string;
  [key: string]: any;
};

export default function BnplScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const s = await apiRequest<Settings>("/bnpl/settings");
        setSettings(s);
        if (token) {
          try {
            setElig(await apiRequest<Eligibility>("/bnpl/eligibility", { token }));
          } catch (e) {
            setElig({ eligible: false, message: e instanceof Error ? e.message : "Unavailable" });
          }
        } else {
          setElig(null);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load BNPL");
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const methods = [
    { key: "Klarna", on: settings?.klarnaEnabled },
    { key: "Affirm", on: settings?.affirmEnabled },
    { key: "Afterpay", on: settings?.afterpayEnabled },
  ];

  return (
    <View style={styles.root}>
      <AppHeader title="Buy Now, Pay Later" showBack showBrand={false} showCart={false} />
      {!settings && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
        >
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}
          <View style={styles.card}>
            <Text style={styles.hero}>Split purchases over time</Text>
            <Text style={styles.sub}>
              Available at checkout for eligible orders between{" "}
              {money(settings?.minAmountUsd ?? 50)} and {money(settings?.maxAmountUsd ?? 2000)}.
            </Text>
            <Text style={styles.line}>Platform fee ~{settings?.platformFeePct ?? 3.5}%</Text>
          </View>
          <Text style={styles.section}>Providers</Text>
          {methods.map((m) => (
            <View key={m.key} style={styles.row}>
              <Text style={styles.rowTitle}>{m.key}</Text>
              <Text style={[styles.badge, { color: m.on ? colors.flexaGreen : "#94A3B8" }]}>
                {m.on ? "Enabled" : "Off"}
              </Text>
            </View>
          ))}
          <Text style={styles.section}>Your eligibility</Text>
          {!token ? (
            <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
              <Text style={styles.btnText}>Log in to check eligibility</Text>
            </Pressable>
          ) : elig ? (
            <View style={styles.card}>
              <Text style={styles.badgeBig}>{elig.eligible ? "Eligible" : "Not eligible"}</Text>
              {elig.message ? <Text style={styles.sub}>{elig.message}</Text> : null}
              {(elig.reasons ?? []).map((r: string, i: number) => (
                <Text key={i} style={styles.line}>
                  • {r}
                </Text>
              ))}
              {!elig.reasons?.length && !elig.message ? (
                <Text style={styles.sub}>
                  Typically requires verified phone, account age, and completed orders. BNPL is offered at checkout for
                  qualifying carts.
                </Text>
              ) : null}
            </View>
          ) : (
            <ActivityIndicator color={colors.flexaGreen} />
          )}
          <Pressable style={styles.link} onPress={() => router.push("/")}>
            <Text style={styles.linkText}>Browse marketplace</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 12,
  },
  hero: { fontSize: 18, fontWeight: "800", color: colors.light.text },
  sub: { color: "#64748B", marginTop: 6, lineHeight: 20 },
  line: { marginTop: 6, color: "#334155", fontSize: 13 },
  section: { fontWeight: "800", fontSize: 15, marginBottom: 8, marginTop: 4, color: colors.light.text },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: colors.light.text },
  badge: { fontWeight: "800" },
  badgeBig: { fontWeight: "800", fontSize: 16, color: colors.flexaGreen, marginBottom: 6 },
  btn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { marginTop: 16 },
  linkText: { color: colors.flexaGreen, fontWeight: "800" },
});
