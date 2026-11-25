/**
 * Flexa Wholesale immersive shell — brand chrome + 5 tabs + Flexa Market exit.
 * Zero WebView. Safe-area aware for Android/iOS.
 */
import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type Tab = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  href: string;
  match: (p: string) => boolean;
};

export function WholesaleShell({
  children,
  title,
  subtitle,
  headerRight,
  scroll = true,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const atHome = pathname === "/wholesale" || pathname === "/wholesale/";
  const tabs: Tab[] = useMemo(
    () => [
      {
        key: "catalog",
        label: t("wholesale_tabCatalog"),
        icon: "grid",
        href: "/wholesale",
        match: (p) =>
          p === "/wholesale" ||
          p.startsWith("/wholesale/search") ||
          p.startsWith("/wholesale/categories") ||
          p.startsWith("/wholesale/products") ||
          p.startsWith("/wholesale/country") ||
          p.startsWith("/wholesale/city") ||
          p.startsWith("/wholesale/featured") ||
          p.startsWith("/wholesale/compare") ||
          p.startsWith("/wholesale/recent") ||
          p.startsWith("/wholesale/help") ||
          p.startsWith("/wholesale/pickup") ||
          p.startsWith("/wholesale/map"),
      },
      {
        key: "depots",
        label: t("wholesale_tabDepots"),
        icon: "home",
        href: "/wholesale/warehouses",
        match: (p) => p.startsWith("/wholesale/warehouses") || p.startsWith("/wholesale/stores"),
      },
      {
        key: "chat",
        label: t("wholesale_tabInquiries"),
        icon: "message-circle",
        href: "/wholesale/inquiries",
        match: (p) =>
          p.startsWith("/wholesale/inquiries") ||
          p.startsWith("/wholesale/favorites") ||
          p.startsWith("/wholesale/notifications") ||
          p.startsWith("/wholesale/deals") ||
          p.startsWith("/wholesale/quotes") ||
          p.startsWith("/wholesale/disputes") ||
          p.startsWith("/wholesale/blocked"),
      },
      {
        key: "seller",
        label: t("wholesale_tabSeller"),
        icon: "package",
        href: "/wholesale/seller",
        match: (p) => p.startsWith("/wholesale/seller") || p.startsWith("/wholesale/verification"),
      },
      {
        key: "admin",
        label: t("wholesale_tabAdmin"),
        icon: "shield",
        href: "/wholesale/admin",
        match: (p) => p.startsWith("/wholesale/admin"),
      },
    ],
    [t],
  );

  const body = scroll ? (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.bodyContent}
      keyboardShouldPersistTaps="handled"
    >
      {(title || subtitle) && (
        <View style={styles.pageHead}>
          {title ? <Text style={styles.pageTitle}>{title}</Text> : null}
          {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
        </View>
      )}
      {children}
    </ScrollView>
  ) : (
    <View style={styles.body}>
      {(title || subtitle) && (
        <View style={[styles.pageHead, { paddingHorizontal: 16 }]}>
          {title ? <Text style={styles.pageTitle}>{title}</Text> : null}
          {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
        </View>
      )}
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="wholesale-native-shell">
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {!atHome ? (
            <Pressable
              onPress={() => router.push("/wholesale")}
              style={styles.iconBtn}
              accessibilityLabel={t("wholesale_backHome")}
              testID="wholesale-back"
            >
              <Feather name="arrow-left" size={18} color={T.white} />
            </Pressable>
          ) : null}
          <Pressable
            style={styles.brandBlock}
            onPress={() => router.push("/wholesale")}
            accessibilityRole="header"
          >
            <View style={styles.brandIcon}>
              <Feather name="home" size={18} color={T.forest} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.brand} numberOfLines={1}>
                {t("wholesale_cardEyebrow")}
              </Text>
              <Text style={styles.brandLine} numberOfLines={1}>
                {t("wholesale_brandLine")}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={styles.marketBtn}
            accessibilityLabel={t("wholesale_exitToMarket")}
            testID="wholesale-exit-to-market"
          >
            <Feather name="home" size={14} color={T.forest} />
            <Text style={styles.marketBtnText}>{t("wholesale_toFlexaMarket")}</Text>
          </Pressable>
          {headerRight}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {tabs.map((tab) => {
            const on = tab.match(pathname);
            return (
              <Pressable
                key={tab.key}
                onPress={() => router.push(tab.href as any)}
                style={[styles.tab, on && styles.tabOn]}
                testID={`wholesale-tab-${tab.key}`}
              >
                <Feather name={tab.icon} size={14} color={on ? T.forest : "rgba(255,255,255,0.85)"} />
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {body}
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.mintSoft },
  header: {
    backgroundColor: T.forest,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandBlock: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.white,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: T.white, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  brandLine: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "600", marginTop: 1 },
  marketBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: T.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  marketBtnText: { color: T.forest, fontSize: 11, fontWeight: "800" },
  tabs: { paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  tabOn: { backgroundColor: T.white },
  tabLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
  tabLabelOn: { color: T.forest },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },
  pageHead: { marginBottom: 14 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: T.ink, letterSpacing: -0.3 },
  pageSub: { marginTop: 4, fontSize: 13, color: T.muted, fontWeight: "500" },
});
