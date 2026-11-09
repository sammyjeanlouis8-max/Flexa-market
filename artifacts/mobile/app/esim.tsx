/**
 * Flexa eSIM — DEFERRED (Phase 3B).
 * Provider integration is not ready. This screen intentionally does not sell
 * plans, invent prices, or generate QR codes.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EsimDeferredScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Flexa eSIM</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>DEFERRED</Text>
        </View>
        <Text style={styles.heading}>eSIM purchases are not available yet</Text>
        <Text style={styles.body}>
          The mobile carrier / eSIM provider integration is not ready. Flexa Market
          will not show fake plans, fake prices, or fake QR codes.
        </Text>
        <Text style={styles.body}>
          Existing eSIM-related backend code is preserved and left inactive. This
          feature will be enabled in a later phase once the provider is approved.
        </Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/")}>
          <Text style={styles.btnText}>Back to marketplace</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  badgeText: { color: "#B45309", fontWeight: "800", fontSize: 11, letterSpacing: 0.6 },
  heading: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, color: "#475569", marginBottom: 10 },
  btn: {
    marginTop: 12,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
