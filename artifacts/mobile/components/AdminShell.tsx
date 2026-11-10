/**
 * Shared chrome for native Admin Control Center screens.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  error?: string | null;
  right?: React.ReactNode;
  scroll?: boolean;
};

export function AdminShell({
  title,
  children,
  refreshing,
  onRefresh,
  loading,
  error,
  right,
  scroll = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const body = (
    <>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#F97316" style={{ marginTop: 24 }} /> : children}
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {right ?? <View style={{ width: 40 }} />}
      </View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28, gap: 10 }}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#F97316" />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>{body}</View>
      )}
    </View>
  );
}

export const adminStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 4,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  cardSub: { color: "#64748B", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  chipTextOn: { color: "#fff" },
  btn: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  btnGhost: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btnGhostText: { color: "#0F172A", fontWeight: "700", fontSize: 12 },
  danger: { backgroundColor: "#DC2626" },
  search: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: "#0F172A",
  },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  metricVal: { fontWeight: "900", color: "#0F172A", fontSize: 18 },
  metricLabel: { color: "#64748B", fontSize: 11, marginTop: 2 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 24 },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 4 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, marginBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontWeight: "800", fontSize: 17, color: "#0F172A" },
  error: {
    color: "#DC2626",
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    fontWeight: "600",
  },
});
