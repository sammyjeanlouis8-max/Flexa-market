import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerProfile, patchSellerProfile } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerSettingsScreen() {
  const { token } = useAuth();
  const [notifyQuotes, setNotifyQuotes] = useState(true);
  const [notifyChat, setNotifyChat] = useState(true);
  const [autoReply, setAutoReply] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const p = await fetchSellerProfile({ token });
      const s = (p.settings || {}) as Record<string, unknown>;
      setNotifyQuotes(s.notifyQuotes !== false);
      setNotifyChat(s.notifyChat !== false);
      setAutoReply(!!s.autoReply);
    } catch (e: any) {
      setError(e?.message || "Failed to load settings");
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
      await patchSellerProfile(
        { settings: { notifyQuotes, notifyChat, autoReply } },
        { token },
      );
      setOk(true);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Seller settings" subtitle="Notification and reply preferences">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {ok ? <Text style={styles.ok}>Saved.</Text> : null}
            <Row label="Quote notifications" value={notifyQuotes} onChange={setNotifyQuotes} />
            <Row label="Chat notifications" value={notifyChat} onChange={setNotifyChat} />
            <Row label="Suggest auto-reply opener" value={autoReply} onChange={setAutoReply} />
            <Pressable style={styles.btn} onPress={() => void save()} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save settings"}</Text>
            </Pressable>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: { fontSize: 14, fontWeight: "600", color: T.ink, flex: 1, paddingRight: 12 },
  btn: { backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: T.white, fontWeight: "800" },
  error: { color: T.danger, fontWeight: "700" },
  ok: { color: T.accent, fontWeight: "700" },
});
