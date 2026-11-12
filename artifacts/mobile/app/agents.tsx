/**
 * Cash agent directory — GET /api/agents/public
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

type Agent = {
  id: number;
  fullName?: string | null;
  businessName?: string | null;
  city?: string | null;
  country?: string | null;
  whatsappNumber?: string | null;
  phone?: string | null;
  isOnline?: boolean;
  exchangeRate?: number | null;
  exchangeRateDop?: number | null;
  accountNumber?: string | null;
  userName?: string | null;
};

export default function AgentsScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const res = await apiRequest<{ agents: Agent[] }>(
          `/agents/public${onlineOnly ? "?onlineOnly=1" : ""}`,
          { token },
        );
        setAgents(res.agents ?? []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load agents");
        setAgents((p) => p ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, onlineOnly],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return agents ?? [];
    return (agents ?? []).filter((a) =>
      [a.fullName, a.businessName, a.city, a.country, a.userName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [agents, q]);

  return (
    <View style={styles.root}>
      <AppHeader title="Cash agents" showBack />
      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Feather name="search" size={16} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search city or name"
            placeholderTextColor="#94A3B8"
          />
        </View>
        <Pressable
          style={[styles.filter, onlineOnly && styles.filterOn]}
          onPress={() => setOnlineOnly((v) => !v)}
        >
          <Text style={[styles.filterText, onlineOnly && { color: "#fff" }]}>Online</Text>
        </Pressable>
      </View>
      {agents === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => String(a.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
          contentContainerStyle={
            !filtered.length ? { flexGrow: 1, justifyContent: "center", padding: 24 } : { padding: 16 }
          }
          ListHeaderComponent={
            error ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : (
              <Text style={styles.intro}>Approved agents for cash in / cash out near you.</Text>
            )
          }
          ListEmptyComponent={<Text style={styles.empty}>No agents found</Text>}
          renderItem={({ item }) => {
            const name = item.businessName || item.fullName || item.userName || "Agent";
            const phone = item.whatsappNumber || item.phone;
            return (
              <View style={styles.card}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{name}</Text>
                  <View style={[styles.dot, { backgroundColor: item.isOnline ? "#22C55E" : "#94A3B8" }]} />
                </View>
                <Text style={styles.meta}>
                  {[item.city, item.country].filter(Boolean).join(", ") || "Location TBD"}
                </Text>
                {item.exchangeRate != null ? (
                  <Text style={styles.rate}>HTG rate ~{item.exchangeRate}</Text>
                ) : null}
                {item.accountNumber ? <Text style={styles.meta}>FM {item.accountNumber}</Text> : null}
                {phone ? (
                  <Pressable
                    style={styles.btn}
                    onPress={() => Linking.openURL(`https://wa.me/${phone.replace(/[^\d]/g, "")}`)}
                  >
                    <Feather name="message-circle" size={16} color="#fff" />
                    <Text style={styles.btnText}>WhatsApp</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  toolbar: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 42,
  },
  searchInput: { flex: 1, color: colors.light.text },
  filter: {
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  filterOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  filterText: { fontWeight: "700", color: colors.light.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  intro: { color: "#64748B", marginBottom: 10, fontSize: 13 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  empty: { textAlign: "center", color: "#94A3B8" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "800", fontSize: 15, color: colors.light.text, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  meta: { color: "#64748B", marginTop: 4, fontSize: 12 },
  rate: { marginTop: 6, color: colors.flexaGreen, fontWeight: "700" },
  btn: {
    marginTop: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#128C7E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
