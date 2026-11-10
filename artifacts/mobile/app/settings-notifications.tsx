/**
 * Native notification preferences — PUT /users/me/preferences.
 * Push toggle also registers/unregisters Expo token.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from "@/lib/preferencesApi";
import { registerExpoPushToken, unregisterExpoPushToken } from "@/lib/pushPrep";

export default function SettingsNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setPrefs(await fetchUserPreferences({ token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load preferences");
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

  const toggle = async (key: keyof UserPreferences, value: boolean) => {
    if (!token || !prefs) return;
    setBusy(key);
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      const saved = await updateUserPreferences({ [key]: value }, { token });
      setPrefs(saved);
      if (key === "notifyPush") {
        if (value) await registerExpoPushToken(token);
        else await unregisterExpoPushToken(token);
      }
    } catch (e) {
      setPrefs(prefs);
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const rows: { key: keyof UserPreferences; title: string; hint: string }[] = [
    {
      key: "notifyPush",
      title: "Push notifications",
      hint: "Orders, messages, support, delivery, promotions, system",
    },
    {
      key: "notifyEmail",
      title: "Email notifications",
      hint: "Account and order emails when enabled server-side",
    },
    {
      key: "notifySms",
      title: "SMS notifications",
      hint: "SMS alerts when enabled for your country",
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: 16 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {!prefs && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <View style={{ gap: 10, marginTop: 8 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.note}>
            Preferences sync to your Flexa Market account. Channel detail (orders, chat, seller
            activity) follows server notification routing when push is enabled.
          </Text>
          {rows.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{r.title}</Text>
                <Text style={styles.hint}>{r.hint}</Text>
              </View>
              {busy === r.key ? (
                <ActivityIndicator color="#F97316" />
              ) : (
                <Switch
                  value={Boolean(prefs?.[r.key])}
                  onValueChange={(v) => void toggle(r.key, v)}
                  trackColor={{ false: "#CBD5E1", true: "#FDBA74" }}
                  thumbColor={prefs?.[r.key] ? "#F97316" : "#f4f3f4"}
                  testID={`switch-${r.key}`}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", fontWeight: "600" },
  note: { color: "#64748B", fontSize: 12, lineHeight: 17, marginBottom: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff",
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E2E8F0",
  },
  label: { fontWeight: "800", color: "#0F172A" },
  hint: { color: "#64748B", fontSize: 12, marginTop: 2 },
});
