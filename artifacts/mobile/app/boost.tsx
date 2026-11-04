import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { NavLink } from "@/components/NavLink";
import { SignInGate } from "@/components/SignInGate";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type BoostMethod = {
  id?: string;
  method?: string;
  label?: string;
  name?: string;
};

export default function BoostScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [methods, setMethods] = useState<BoostMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<BoostMethod[] | { methods?: BoostMethod[] }>(
        "/boost/methods",
        { token },
      );
      setMethods(Array.isArray(data) ? data : data.methods ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load boost methods");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) {
    return (
      <NativeScreen title="Boost" subtitle="Promote your listings.">
        <SignInGate message="Sign in to buy listing boosts." />
      </NativeScreen>
    );
  }

  return (
    <NativeScreen
      title="Boost"
      subtitle="Native boost entry. Purchase initiation stays on existing /api/boost endpoints."
    >
      <StatusCard
        label="Methods loaded"
        value={loading ? "Loading…" : String(methods.length)}
        detail={error || "Select a listing from My listings to start a boost."}
        tone={error ? "warn" : "ok"}
      />
      <View style={{ gap: 10 }}>
        <NavLink href="/my-listings" label="Choose a listing" />
        <NavLink href="/my-boosts" label="My active boosts" />
        <NavLink href="/wallet" label="Wallet balance" />
      </View>
      {methods.map((m, idx) => (
        <View
          key={String(m.id ?? m.method ?? idx)}
          style={[styles.row, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>
            {m.label || m.name || m.method || `Method ${idx + 1}`}
          </Text>
        </View>
      ))}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      <Pressable onPress={() => router.back()} style={{ marginTop: 8 }}>
        <Text style={{ color: colors.mutedForeground }}>Back</Text>
      </Pressable>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 12, padding: 14 },
});
