import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { apiFetch } from "@/lib/api";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES, countryFlag } from "@/lib/countries";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CountryPickerScreen() {
  const { token, user } = useAuth();
  const { country, setCountry } = useMarketplace();
  const [query, setQuery] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useAndroidBack();

  const lockedChange =
    Boolean(token && user?.country); /* change-country requires phone verify flow later */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUPPORTED_COUNTRIES;
    return SUPPORTED_COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    // Soft detect suggestion for guests / first-time users — never overwrites a
    // manual selection already stored (Smart Location rule).
    if (user?.country) return;
    let cancelled = false;
    (async () => {
      setDetecting(true);
      try {
        const res = await apiFetch("/auth/detect-country");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.country && SUPPORTED_COUNTRIES.includes(data.country)) {
          setDetectNote(`Suggested: ${countryFlag(data.country)} ${data.country}`);
        } else {
          setDetectNote(null);
        }
      } catch {
        if (!cancelled) setDetectNote(null);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.country]);

  async function choose(next: string) {
    if (lockedChange && next !== user?.country) {
      setDetectNote(
        "Your account country is already set. Use the verified change-country flow in Settings (coming in a later milestone).",
      );
      return;
    }
    setSaving(true);
    try {
      await setCountry(next);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } finally {
      setSaving(false);
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
      <Text style={styles.title}>Marketplace country</Text>
      <Text style={styles.sub}>
        Current: {countryFlag(country)} {country}
        {lockedChange ? " (account locked)" : ""}
      </Text>
      {detecting ? <ActivityIndicator color="#F97316" style={{ marginVertical: 8 }} /> : null}
      {detectNote ? <Text style={styles.note}>{detectNote}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Search countries…"
        placeholderTextColor="#64748B"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const active = item === country;
          return (
            <Pressable
              style={[styles.row, active && styles.rowActive]}
              onPress={() => void choose(item)}
              disabled={saving}
            >
              <Text style={styles.flag}>{COUNTRY_FLAGS[item]}</Text>
              <Text style={styles.name}>{item}</Text>
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
    fontSize: 22,
    fontWeight: "800",
    color: "#F97316",
  },
  sub: { marginHorizontal: 16, color: "#94A3B8", marginBottom: 8 },
  note: { marginHorizontal: 16, color: "#CBD5E1", fontSize: 13, marginBottom: 8 },
  input: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#F8FAFC",
  },
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
  name: { flex: 1, color: "#F8FAFC", fontWeight: "600" },
});
