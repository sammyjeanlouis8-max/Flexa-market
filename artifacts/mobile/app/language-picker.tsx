/**
 * Native language picker — local LanguageContext + PATCH /api/auth/language when signed in.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { LANGUAGES, useLanguage, type Lang } from "@/context/LanguageContext";
import { patchPreferredLanguage } from "@/lib/profileApi";

export default function LanguagePickerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, refreshUser } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [busy, setBusy] = useState<string | null>(null);

  const onSelect = async (code: Lang) => {
    setBusy(code);
    try {
      await setLang(code);
      if (token) {
        await patchPreferredLanguage(code, { token });
        await refreshUser();
      }
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch {
      /* local language still applied */
    } finally {
      setBusy(null);
    }
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
        <Text style={styles.title}>{t("languagesTitle") || "Languages"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text style={styles.hint}>{t("selectLanguage") || "Select your language"}</Text>
      <FlatList
        data={LANGUAGES}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => void onSelect(item.code)}>
            <Text style={styles.flag}>{item.flag}</Text>
            <View style={styles.meta}>
              <Text style={styles.native}>{item.native}</Text>
              <Text style={styles.label}>{item.label}</Text>
            </View>
            {busy === item.code ? (
              <ActivityIndicator color="#F97316" />
            ) : lang === item.code ? (
              <Feather name="check" size={18} color="#F97316" />
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  hint: { color: "#64748B", marginBottom: 12, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 8,
  },
  flag: { fontSize: 22 },
  meta: { flex: 1 },
  native: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  label: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
});
