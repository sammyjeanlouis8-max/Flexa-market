import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerProfile, patchSellerProfile } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const PLANS = [
  { id: "free", title: "Free", meta: "Verified warehouse required · chat only" },
  { id: "growth", title: "Growth", meta: "Featured slots + team invites" },
  { id: "pro", title: "Pro", meta: "Priority verification + media library" },
] as const;

export default function SellerPlansScreen() {
  const { token } = useAuth();
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const p = await fetchSellerProfile({ token });
      setPlan(p.plan || "free");
    } catch (e: any) {
      setError(e?.message || "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const select = async (next: string) => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await patchSellerProfile({ plan: next }, { token });
      setPlan(next);
    } catch (e: any) {
      setError(e?.message || "Could not update plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Plans" subtitle="Wholesale plan preference (billing not charged in closed beta)">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.list}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {PLANS.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.card, plan === p.id && styles.cardOn]}
                onPress={() => void select(p.id)}
                disabled={saving}
              >
                <Text style={styles.title}>{p.title}</Text>
                <Text style={styles.meta}>{p.meta}</Text>
                {plan === p.id ? <Text style={styles.current}>Current</Text> : null}
              </Pressable>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 4,
  },
  cardOn: { borderColor: T.accent, backgroundColor: T.accentSoft },
  title: { fontSize: 16, fontWeight: "800", color: T.ink },
  meta: { fontSize: 13, color: T.muted },
  current: { marginTop: 4, color: T.accent, fontWeight: "800" },
  error: { color: T.danger, fontWeight: "700" },
});
