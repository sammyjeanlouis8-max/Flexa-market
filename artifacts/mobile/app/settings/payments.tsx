/**
 * Payments settings — wallet shortcuts + Flex Card / BNPL.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchWalletBalance } from "@/lib/walletApi";
import { apiRequest, money } from "@/lib/request";

export default function SettingsPaymentsScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [balance, setBalance] = useState<string | null>(null);
  const [cardBlocked, setCardBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const b = await fetchWalletBalance({ token });
      setBalance(money(b.availableUsd));
      const card = await apiRequest<any>("/flex-card/me", { token }).catch(() => null);
      setCardBlocked(!!card?.blocked);
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  return (
    <View style={styles.root}>
      <AppHeader title="Payments" showBack showCart={false} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.card}>
            <Text style={styles.label}>Available wallet</Text>
            <Text style={styles.balance}>{balance ?? "—"}</Text>
            {cardBlocked ? (
              <Text style={styles.warn}>Flex Card blocked — repay outstanding debt</Text>
            ) : null}
          </View>
          {[
            { title: "Wallet", href: "/wallet", icon: "credit-card" as const },
            { title: "Transfer", href: "/wallet-transfer", icon: "send" as const },
            { title: "History", href: "/wallet-history", icon: "clock" as const },
            { title: "Flex Card repay", href: "/flex-card-repay", icon: "refresh-cw" as const },
            { title: "BNPL", href: "/bnpl", icon: "calendar" as const },
            { title: "Cash agents", href: "/agents", icon: "map-pin" as const },
          ].map((item) => (
            <Pressable key={item.href} style={styles.row} onPress={() => router.push(item.href as any)}>
              <Feather name={item.icon} size={18} color={colors.flexaGreen} />
              <Text style={styles.title}>{item.title}</Text>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  label: { color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  balance: { color: "#fff", fontSize: 32, fontWeight: "900", marginTop: 4 },
  warn: { marginTop: 8, color: "#FED7AA", fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  title: { flex: 1, fontWeight: "700", color: colors.light.text },
});
