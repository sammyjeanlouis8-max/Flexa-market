/**
 * Privacy — blocked users from verified API.
 * Profile visibility toggles have no backend; device-only note shown.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchBlockedUsers, unblockUser, type BlockedUser } from "@/lib/blocksApi";

const PROFILE_VISIBLE_KEY = "fm_privacy_profile_visible";
const SHOW_ONLINE_KEY = "fm_privacy_show_online";

export default function SettingsPrivacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileVisible, setProfileVisible] = useState(true);
  const [showOnline, setShowOnline] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [b, pv, so] = await Promise.all([
        fetchBlockedUsers({ token }),
        AsyncStorage.getItem(PROFILE_VISIBLE_KEY),
        AsyncStorage.getItem(SHOW_ONLINE_KEY),
      ]);
      setBlocks(b);
      setProfileVisible(pv !== "0");
      setShowOnline(so !== "0");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load privacy settings");
      setBlocks((prev) => prev ?? []);
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

  const onUnblock = (u: BlockedUser) => {
    if (!token) return;
    Alert.alert("Unblock user?", u.name || `User #${u.id}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        onPress: async () => {
          try {
            await unblockUser(u.id, { token });
            setBlocks((prev) => (prev ?? []).filter((x) => x.id !== u.id));
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Error");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      {blocks === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={blocks ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28 }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 12 }}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.note}>
                Profile visibility toggles are stored on this device only (no privacy API yet).
                Blocked users sync with the server.
              </Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Profile visible</Text>
                  <Text style={styles.hint}>Device preference</Text>
                </View>
                <Switch
                  value={profileVisible}
                  onValueChange={(v) => {
                    setProfileVisible(v);
                    void AsyncStorage.setItem(PROFILE_VISIBLE_KEY, v ? "1" : "0");
                  }}
                  trackColor={{ false: "#CBD5E1", true: "#FDBA74" }}
                  thumbColor={profileVisible ? "#F97316" : "#f4f3f4"}
                />
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Show online status</Text>
                  <Text style={styles.hint}>Device preference</Text>
                </View>
                <Switch
                  value={showOnline}
                  onValueChange={(v) => {
                    setShowOnline(v);
                    void AsyncStorage.setItem(SHOW_ONLINE_KEY, v ? "1" : "0");
                  }}
                  trackColor={{ false: "#CBD5E1", true: "#FDBA74" }}
                  thumbColor={showOnline ? "#F97316" : "#f4f3f4"}
                />
              </View>
              <Pressable style={styles.link} onPress={() => router.push("/legal/privacy")}>
                <Text style={styles.linkText}>Privacy policy</Text>
              </Pressable>
              <Text style={styles.section}>Blocked users</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No blocked users.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name || `User #${item.id}`}</Text>
              <Pressable onPress={() => onUnblock(item)}>
                <Text style={styles.unblock}>Unblock</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", fontWeight: "600" },
  note: { color: "#64748B", fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff",
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E2E8F0",
  },
  label: { fontWeight: "800", color: "#0F172A" },
  hint: { color: "#64748B", fontSize: 12, marginTop: 2 },
  link: { paddingVertical: 4 },
  linkText: { color: "#EA580C", fontWeight: "700" },
  section: { fontWeight: "800", color: "#0F172A" },
  empty: { color: "#94A3B8", marginTop: 8 },
  card: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 8,
  },
  cardTitle: { fontWeight: "700", color: "#0F172A" },
  unblock: { color: "#DC2626", fontWeight: "700" },
});
