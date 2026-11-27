import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAdminCountries, putAdminCountry } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

type CountryRow = {
  countryCode?: string;
  name?: string;
  status?: string;
  enabled?: boolean;
  publiclyActive?: boolean;
  notes?: string;
};

export default function AdminCountriesScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const isSuperAdmin = String((user as any)?.role || "").toLowerCase() === "super_admin";
  const [rows, setRows] = useState<CountryRow[]>([]);
  const [defaultDeny, setDefaultDeny] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminCountries({ token });
      setRows((data.countries || []) as CountryRow[]);
      setDefaultDeny(!!data.defaultDeny);
    } catch (e: any) {
      setError(e?.message || "Failed to load countries");
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!isSuperAdmin) return;
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load, isSuperAdmin]),
  );

  async function setStatus(code: string, status: string, enabled: boolean) {
    setMsg(null);
    try {
      await putAdminCountry(code, { status, enabled }, { token: token! });
      setMsg(`${code} → ${status}${enabled ? " (enabled)" : ""}`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    }
  }

  if (!isSuperAdmin) {
    return (
      <RestaurantShell title={t("restaurant_adminCountries") || "Country availability"}>
        <Text style={styles.err}>{t("restaurant_superAdminOnly") || "Super Admin only."}</Text>
      </RestaurantShell>
    );
  }

  return (
    <RestaurantShell
      title={t("restaurant_adminCountries") || "Country availability"}
      subtitle={t("restaurant_adminCountriesBody") || "Default-deny regulatory allowlist"}
      scroll={false}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
      >
        <Text style={styles.note}>
          {defaultDeny
            ? t("restaurant_defaultDenyOn") || "Default-deny is ON. US/CA hard-disabled. Haiti under review."
            : "Default-deny off"}
        </Text>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : (
          rows.map((c) => {
            const code = String(c.countryCode || "");
            return (
              <View key={code} style={styles.card}>
                <Text style={styles.title}>
                  {code} {c.name ? `· ${c.name}` : ""}
                </Text>
                <Text style={styles.muted}>
                  status={c.status || "—"} · enabled={String(!!c.enabled)} · public={String(!!c.publiclyActive)}
                </Text>
                <View style={styles.row}>
                  <Pressable style={styles.mini} onPress={() => void setStatus(code, "disabled", false)}>
                    <Text style={styles.miniText}>Disable</Text>
                  </Pressable>
                  <Pressable style={styles.mini} onPress={() => void setStatus(code, "under_review", false)}>
                    <Text style={styles.miniText}>Under review</Text>
                  </Pressable>
                  <Pressable style={styles.mini} onPress={() => void setStatus(code, "approved", true)}>
                    <Text style={styles.miniText}>Approve+enable</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </ScrollView>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 10, lineHeight: 17 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "900", color: T.ink },
  muted: { marginTop: 4, fontSize: 12, color: T.muted },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  mini: {
    backgroundColor: "rgba(26,107,71,0.08)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  miniText: { fontSize: 10, fontWeight: "800", color: T.accent },
  err: { color: "#b91c1c" },
  msg: { marginTop: 8, color: T.accent, fontWeight: "700" },
});
