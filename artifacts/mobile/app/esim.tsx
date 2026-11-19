/**
 * Flexa eSIM — provider not integrated yet.
 * Native screen is reachable from the drawer; back navigation works.
 * Does not sell plans or invent QR/activation.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EsimDeferredScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      testID="esim-screen"
    >
      <View style={styles.topBar}>
        <Pressable style={styles.back} onPress={goBack} testID="esim-back">
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Flexa eSIM</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>COMING SOON</Text>
        </View>
        <Text style={styles.heading}>eSIM is not available yet</Text>
        <Text style={styles.body}>
          No eSIM provider contract, catalog API, checkout endpoint, or QR
          activation flow is live. Country selection, plan discovery, payment,
          and activation will ship after an authorized provider is integrated.
        </Text>
        <Text style={styles.body}>
          This screen does not invent plans, prices, QR codes, or fake success
          states.
        </Text>
        <Pressable style={styles.btn} onPress={goBack} testID="esim-back-home">
          <Text style={styles.btnText}>Back</Text>
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
    gap: 12,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: "#B45309", fontWeight: "800", fontSize: 11 },
  heading: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  body: { fontSize: 14, lineHeight: 20, color: "#475569" },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
