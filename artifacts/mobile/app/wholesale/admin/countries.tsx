import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "@/lib/countries";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleAdminCountriesScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_adminCountries")} subtitle={t("wholesale_adminCountriesSub")}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t("wholesale_live")}</Text>
            <Text style={styles.statValue}>{SUPPORTED_COUNTRIES.length}</Text>
          </View>
        </View>
        <View style={styles.list}>
          {SUPPORTED_COUNTRIES.map((country) => (
            <Pressable
              key={country}
              style={styles.row}
              onPress={() =>
                router.push(`/wholesale/country/${encodeURIComponent(country)}` as any)
              }
            >
              <Text style={styles.flag}>{COUNTRY_FLAGS[country] || "🏳️"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{country}</Text>
                <Text style={styles.meta}>Enabled for depot selling</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>On</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  stat: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.accent },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  flag: { fontSize: 22 },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
});
