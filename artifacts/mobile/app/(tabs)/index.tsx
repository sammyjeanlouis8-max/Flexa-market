/**
 * Home — Phase 0 native foundation screen.
 * Verifies API connectivity; full marketplace feed arrives in Phase 1.
 */
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
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  checkApiHealth,
  isApiClientConfigured,
  type ApiHealthResult,
} from "@/lib/api-client";
import {
  getApiBaseUrl,
  getApiOrigin,
  NATIVE_APP_PHASE,
} from "@/lib/config";

export default function HomeTab() {
  const colors = useColors();
  const { user, token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [health, setHealth] = useState<ApiHealthResult | null>(null);
  const [checking, setChecking] = useState(true);

  const runHealthCheck = useCallback(async () => {
    setChecking(true);
    const result = await checkApiHealth();
    setHealth(result);
    setChecking(false);
  }, []);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  const sessionValue = authLoading
    ? "Ap chaje…"
    : token
      ? user?.name
        ? `Konekte — ${user.name}`
        : "Konekte (jeton aktif)"
      : "Pa konekte";

  return (
    <NativeScreen
      title="Flexa Market"
      subtitle="Faz 0 — estrikti natif natal, navigasyon, ak koneksyon API."
    >
      <StatusCard
        label="Faz"
        value={`Faz ${NATIVE_APP_PHASE}`}
        detail="Expo Router aktif. WebView pa se UI prensipal ankò."
        tone="ok"
      />
      <StatusCard
        label="API client"
        value={isApiClientConfigured() ? "Konfigire" : "Pokò"}
        detail={`Origin: ${getApiOrigin()}`}
        tone={isApiClientConfigured() ? "ok" : "warn"}
      />
      <StatusCard
        label="Sèsyon"
        value={sessionValue}
        detail="JWT lokal (SecureStore). Pa gen chanjman auth backend."
        tone={token ? "ok" : "neutral"}
      />
      <StatusCard
        label="Sante API"
        value={
          checking
            ? "Ap verifye…"
            : health?.ok
              ? `OK (${health.latencyMs} ms)`
              : `Echèk${health?.status ? ` · HTTP ${health.status}` : ""}`
        }
        detail={
          checking
            ? `GET ${getApiBaseUrl()}/healthz`
            : health?.ok
              ? `GET ${getApiBaseUrl()}/healthz`
              : health && !health.ok
                ? health.error
                : undefined
        }
        tone={checking ? "neutral" : health?.ok ? "ok" : "bad"}
      />

      <View style={styles.actions}>
        <Pressable
          onPress={() => void runHealthCheck()}
          style={[styles.button, { backgroundColor: colors.primary }]}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <Text style={styles.buttonText}>Verifye API ankò</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/website",
              params: { url: getApiOrigin() },
            })
          }
          style={[styles.buttonSecondary, { borderColor: colors.border }]}
        >
          <Text style={[styles.buttonSecondaryText, { color: colors.foreground }]}>
            Louvri sit (konpatibilite tanporè)
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        Faz 1 ap ajoute ekran natif pou home feed, rechèch, ak listing. Sit web
        pwodiksyon, main, ak DB pa modifye nan faz sa a.
      </Text>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: 8 },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#0F172A", fontWeight: "700", fontSize: 15 },
  buttonSecondary: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  buttonSecondaryText: { fontWeight: "600", fontSize: 14 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 4 },
});
