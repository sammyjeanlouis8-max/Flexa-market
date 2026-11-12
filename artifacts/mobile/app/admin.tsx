/**
 * Native Admin shell — role-gated. Super Admin All Videos uses feed allCountries
 * without changing the admin's profile country.
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchVideosFeed, type PromoVideo } from "@/lib/videosApi";

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const [filterCountry, setFilterCountry] = useState<string | "ALL">("ALL");
  const [videos, setVideos] = useState<PromoVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed =
    !!user &&
    (user.isSuperAdmin ||
      user.isAdmin ||
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.role === "moderator");

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (!authLoading && token && user && !allowed) {
        router.replace("/");
      }
    }, [authLoading, token, user, allowed, router]),
  );

  const loadAllVideos = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchVideosFeed(
        filterCountry === "ALL"
          ? { page: 1, limit: 20, sort: "all", allCountries: true }
          : { page: 1, limit: 20, sort: "all", country: filterCountry },
        { token },
      );
      setVideos(page.videos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load videos");
    } finally {
      setLoading(false);
    }
  }, [filterCountry, token]);

  if (authLoading || !user) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#F97316" />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.error}>Admin access required</Text>
      </View>
    );
  }

  const countries = ["ALL", country, "Haiti", "Dominican Republic", "United States"].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
    >
      <View style={styles.topBar}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>
        Signed in as {user.name}
        {user.isSuperAdmin ? " · Super Admin" : " · Admin"}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>All Videos</Text>
        <Text style={styles.cardBody}>
          Super Admin can preview every country without changing profile country. Choosing a
          country only filters this screen.
        </Text>
        <View style={styles.chips}>
          {countries.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, filterCountry === c && styles.chipOn]}
              onPress={() => setFilterCountry(c as any)}
            >
              <Text style={[styles.chipText, filterCountry === c && styles.chipTextOn]}>
                {c === "ALL" ? "All countries" : c}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.primaryBtn} onPress={() => void loadAllVideos()}>
          <Text style={styles.primaryBtnText}>Load videos</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() =>
            router.push(
              filterCountry === "ALL"
                ? "/videos"
                : `/videos?sort=all`,
            )
          }
        >
          <Text style={styles.secondaryBtnText}>Open feed viewer</Text>
        </Pressable>
        {loading ? <ActivityIndicator color="#F97316" style={{ marginTop: 12 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {videos.slice(0, 8).map((v) => (
          <Pressable
            key={v.id}
            style={styles.videoRow}
            onPress={() => router.push(`/videos?video=${v.id}`)}
          >
            <Text style={styles.videoTitle} numberOfLines={1}>
              {v.title}
            </Text>
            <Text style={styles.videoMeta}>
              {v.country || "—"} · #{v.id}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.note}>
        Full admin finance/moderation tools remain web-first. Authorization for sensitive actions
        stays on the backend.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  subtitle: { color: "#64748B", marginBottom: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  cardBody: { color: "#64748B", fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#fff" },
  primaryBtn: {
    height: 44,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  secondaryBtn: {
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#0F172A", fontWeight: "700" },
  videoRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingTop: 10,
  },
  videoTitle: { fontWeight: "700", color: "#0F172A" },
  videoMeta: { color: "#94A3B8", fontSize: 12 },
  error: { color: "#B91C1C" },
  note: { marginTop: 16, color: "#94A3B8", fontSize: 12, lineHeight: 17 },
});
