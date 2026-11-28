import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { beautyTheme as T } from "@/lib/beautyTheme";

const TABS = [
  { key: "hub", labelKey: "beauty_tabHome", href: "/beauty", icon: "home" as const },
  { key: "appointments", labelKey: "beauty_tabAppointments", href: "/beauty/my-appointments", icon: "calendar" as const },
  { key: "center", labelKey: "beauty_tabCenter", href: "/beauty/center", icon: "briefcase" as const },
  { key: "favorites", labelKey: "beauty_tabFavorites", href: "/beauty/discover", icon: "heart" as const },
];

export function BeautyShell({
  children,
  title,
  subtitle,
  scroll = true,
  compactHeader = false,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  /** Hub homepage uses a tighter brand row (matches reference). */
  compactHeader?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const atHome = pathname === "/beauty" || pathname === "/beauty/";

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, { flex: 1, paddingBottom: insets.bottom + 8 }]}>{children}</View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.header, compactHeader && styles.headerCompact]}>
        <View style={styles.brandRow}>
          {!atHome ? (
            <Pressable
              onPress={() => router.push("/beauty" as any)}
              style={styles.backBtn}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Feather name="arrow-left" size={18} color={T.white} />
            </Pressable>
          ) : (
            <View style={styles.logoMark}>
              <Feather name="scissors" size={16} color={T.rose} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.brand} numberOfLines={1}>
              {t("beauty_hubTitle") || "Séduire Beauty"}
            </Text>
            <Text style={styles.brandLine} numberOfLines={1}>
              {t("beauty_brandLine") || "Beauty · Studio · Barbershop"}
            </Text>
          </View>
          <Pressable
            onPress={() => router.replace("/")}
            style={styles.exitPill}
            accessibilityRole="button"
          >
            <Feather name="home" size={12} color={T.roseDark} />
            <Text style={styles.exitText}>Flexa Market</Text>
          </Pressable>
        </View>

        {(title || subtitle) && !compactHeader ? (
          <View style={styles.titleBlock}>
            {title ? <Text style={styles.pageTitle}>{title}</Text> : null}
            {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TABS.map((tab) => {
            const active =
              tab.href === "/beauty"
                ? pathname === "/beauty" || pathname === "/beauty/"
                : tab.href === "/beauty/center"
                  ? pathname === "/beauty/center"
                    || pathname.startsWith("/beauty/center/")
                    || pathname.startsWith("/beauty/center-")
                  : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Pressable
                key={tab.key}
                onPress={() => router.push(tab.href as any)}
                style={[styles.tab, active && styles.tabActive]}
                accessibilityRole="button"
              >
                <Feather name={tab.icon} size={13} color={active ? T.roseDark : "rgba(255,255,255,0.85)"} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t(tab.labelKey) || tab.key}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.blushSoft },
  header: { backgroundColor: T.rose, paddingHorizontal: 14, paddingBottom: 8 },
  headerCompact: { paddingBottom: 8 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T.white,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: T.white, fontSize: 18, fontWeight: "900", letterSpacing: 0.2 },
  brandLine: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "600", marginTop: 1 },
  exitPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: T.white,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  exitText: { color: T.roseDark, fontSize: 11, fontWeight: "800" },
  titleBlock: { marginTop: 8 },
  pageTitle: { color: T.white, fontSize: 16, fontWeight: "800" },
  pageSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  tabs: { marginTop: 10, maxHeight: 36 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tabActive: { backgroundColor: T.white },
  tabLabel: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "700" },
  tabLabelActive: { color: T.roseDark },
  body: { padding: 14 },
});
