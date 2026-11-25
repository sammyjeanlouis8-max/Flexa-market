import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerProfile, patchSellerProfile } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export default function WarehouseHoursScreen() {
  const { token } = useAuth();
  const [hours, setHours] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const p = await fetchSellerProfile({ token });
      const h = (p.hours || {}) as Record<string, string>;
      const next: Record<string, string> = {};
      for (const d of DAYS) next[d] = h[d] || "09:00-17:00";
      setHours(next);
    } catch (e: any) {
      setError(e?.message || "Failed to load hours");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      await patchSellerProfile({ hours }, { token });
      setOk(true);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Warehouse hours" subtitle="Pickup window shown to buyers in your country">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {ok ? <Text style={styles.ok}>Saved.</Text> : null}
            {DAYS.map((d) => (
              <View key={d} style={styles.row}>
                <Text style={styles.day}>{d.toUpperCase()}</Text>
                <TextInput
                  style={styles.input}
                  value={hours[d] || ""}
                  onChangeText={(v) => setHours((prev) => ({ ...prev, [d]: v }))}
                  placeholder="09:00-17:00 or closed"
                  placeholderTextColor={T.muted}
                />
              </View>
            ))}
            <Pressable style={styles.btn} onPress={() => void save()} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save hours"}</Text>
            </Pressable>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  day: { width: 42, fontWeight: "800", color: T.ink },
  input: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.ink,
  },
  btn: { backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: T.white, fontWeight: "800" },
  error: { color: T.danger, fontWeight: "700" },
  ok: { color: T.accent, fontWeight: "700" },
});
