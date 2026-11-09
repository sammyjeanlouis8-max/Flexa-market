import { useAuth } from "@/context/AuthContext";
import { LANGUAGES, useLanguage, type Lang } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LanguagePickerScreen() {
  const { lang, setLang, t } = useLanguage();
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAndroidBack();

  async function choose(next: Lang) {
    setBusy(true);
    setError(null);
    try {
      await setLang(next);
      if (token) {
        const res = await apiFetch("/auth/language", {
          method: "PATCH",
          token,
          body: JSON.stringify({ language: next }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          // Local language still applies; surface server sync issues.
          setError(body.error || `Could not sync language (${res.status})`);
        }
      }
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="x" size={22} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <View style={styles.iconBtn} />
      </View>
      <Text style={styles.title}>{t("sLanguage")}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={LANGUAGES}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const active = item.code === lang;
          return (
            <Pressable
              style={[styles.row, active && styles.rowActive]}
              disabled={busy}
              onPress={() => void choose(item.code)}
            >
              <Text style={styles.flag}>{item.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.native}</Text>
                <Text style={styles.meta}>{item.label}</Text>
              </View>
              {active ? <Feather name="check" size={18} color="#F97316" /> : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  title: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    fontSize: 22,
    fontWeight: "800",
    color: "#F97316",
  },
  error: { marginHorizontal: 16, color: "#FCA5A5", marginBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowActive: { borderColor: "#F97316" },
  flag: { fontSize: 20 },
  name: { color: "#F8FAFC", fontWeight: "700" },
  meta: { color: "#94A3B8", fontSize: 12 },
});
