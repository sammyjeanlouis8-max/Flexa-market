/**
 * Notification preferences — GET/PUT /api/users/me/preferences
 */
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

type Prefs = { notifyPush?: boolean; notifyEmail?: boolean; notifySms?: boolean };

export default function SettingsNotificationsScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setPrefs(await apiRequest<Prefs>("/users/me/preferences", { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load preferences");
      setPrefs({ notifyPush: true, notifyEmail: true, notifySms: false });
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
    else if (token) void load();
  }, [authLoading, token, router, load]);

  const update = async (key: keyof Prefs, value: boolean) => {
    if (!token || !prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      const saved = await apiRequest<Prefs>("/users/me/preferences", {
        token,
        method: "PUT",
        body: { [key]: value },
      });
      setPrefs(saved);
      setError(null);
    } catch (e) {
      setPrefs(prefs);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Notifications" showBack showCart={false} />
      {!prefs ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <View style={styles.body}>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {(
            [
              ["notifyPush", "Push notifications", "Order updates, chat, and alerts"],
              ["notifyEmail", "Email", "Receipts and security notices"],
              ["notifySms", "SMS", "OTP and delivery texts where available"],
            ] as const
          ).map(([key, title, sub]) => (
            <View key={key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.sub}>{sub}</Text>
              </View>
              <Switch
                value={!!prefs[key]}
                onValueChange={(v) => void update(key, v)}
                trackColor={{ true: colors.flexaGreen, false: "#CBD5E1" }}
                disabled={saving}
              />
            </View>
          ))}
          <Pressable onPress={() => router.push("/notifications")}>
            <Text style={styles.link}>Open notification center</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: 16 },
  err: { color: "#DC2626", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontWeight: "700", color: colors.light.text },
  sub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  link: { marginTop: 8, color: colors.flexaGreen, fontWeight: "800" },
});
