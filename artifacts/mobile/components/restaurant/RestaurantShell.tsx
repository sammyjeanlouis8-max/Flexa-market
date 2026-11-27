import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const TABS = [
  { key: "hub", labelKey: "restaurant_tabDiscover", href: "/restaurant", icon: "grid" as const },
  { key: "orders", labelKey: "restaurant_tabMyOrders", href: "/restaurant/my-orders", icon: "shopping-bag" as const },
  { key: "owner", labelKey: "restaurant_tabOwner", href: "/restaurant/owner", icon: "coffee" as const },
];

export function RestaurantShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/")} style={styles.exitBtn}>
          <Feather name="home" size={16} color={T.white} />
          <Text style={styles.exitText}>Flexa Market</Text>
        </Pressable>
        <Text style={styles.brand}>{t("restaurant_hubTitle")}</Text>
        {(title || subtitle) && (
          <View style={styles.titleBlock}>
            {title ? <Text style={styles.pageTitle}>{title}</Text> : null}
            {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Pressable
                key={tab.key}
                onPress={() => router.push(tab.href as any)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Feather name={tab.icon} size={14} color={active ? T.forestDark : "rgba(255,255,255,0.85)"} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(tab.labelKey)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.mintSoft },
  header: { backgroundColor: T.forest, paddingHorizontal: 16, paddingBottom: 10 },
  exitBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: 8 },
  exitText: { color: T.white, fontSize: 12, fontWeight: "700" },
  brand: { color: T.white, fontSize: 22, fontWeight: "900", marginTop: 4 },
  titleBlock: { marginTop: 8 },
  pageTitle: { color: T.white, fontSize: 17, fontWeight: "800" },
  pageSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 },
  tabs: { marginTop: 10, maxHeight: 40 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tabActive: { backgroundColor: T.white },
  tabLabel: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "700" },
  tabLabelActive: { color: T.forestDark },
  body: { padding: 16 },
});