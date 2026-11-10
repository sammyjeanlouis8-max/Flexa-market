/**
 * Boost entry — paid checkout BLOCKED on Android.
 * Routes sellers to campaign library (read-only).
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function BoostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Product boosting</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Feather name="zap" size={28} color="#F97316" />
        <Text style={styles.heading}>Campaign drafts & analytics</Text>
        <Text style={styles.body}>
          Create and manage boost drafts, pause/resume existing paid campaigns, and open
          analytics. Paid launch / wallet spend stays blocked on Android
          (`ANDROID_DIGITAL_PURCHASE_UNAVAILABLE`) until Play Billing policy review.
        </Text>
        <Pressable style={styles.btn} onPress={() => router.push("/boost-create")}>
          <Text style={styles.btnText}>Create campaign draft</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/my-boosts")}>
          <Text style={styles.linkText}>Open my campaigns</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/boost-analytics")}>
          <Text style={styles.linkText}>Boost analytics</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/drafts")}>
          <Text style={styles.linkText}>Drafts hub</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/videos")}>
          <Text style={styles.linkText}>Promotional videos</Text>
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
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  heading: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  body: { color: "#64748B", lineHeight: 20, fontSize: 14 },
  btn: {
    marginTop: 8,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: "#EA580C", fontWeight: "700" },
});
