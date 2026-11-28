import { Feather } from "@expo/vector-icons";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import React, { useCallback, type ReactNode } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { MUSIC_TAB_BAR_CONTENT, musicTheme } from "@/lib/musicTheme";

type TabKey = "home" | "explore" | "library" | "profile";

function activeTab(pathname: string): TabKey {
  if (pathname.includes("/music/search")) return "explore";
  if (pathname.includes("/music/library") || pathname.includes("/music/playlists")) return "library";
  if (pathname.includes("/music/profile") || pathname.includes("/music/upload")) return "profile";
  return "home";
}

function exitToMarket(router: ReturnType<typeof useRouter>) {
  // Leave Music without tearing down the shared player — replace onto Market Home.
  router.replace("/(tabs)/" as any);
}

export function MusicShell({
  title,
  children,
  showNav = true,
  showBack = true,
  showSearch = true,
  headerRight,
}: {
  title?: string;
  children: ReactNode;
  showNav?: boolean;
  showBack?: boolean;
  showSearch?: boolean;
  headerRight?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const tab = activeTab(pathname);
  const isMusicHome =
    tab === "home" &&
    (pathname === "/music" ||
      pathname.endsWith("/music") ||
      pathname.includes("(tabs)/music"));

  const tabs: { key: TabKey; label: string; icon: keyof typeof Feather.glyphMap; href: string }[] = [
    { key: "home", label: t("music_tabHome"), icon: "home", href: "/(tabs)/music" },
    { key: "explore", label: t("music_tabExplore"), icon: "compass", href: "/music/search" },
    { key: "library", label: t("music_tabLibrary"), icon: "book-open", href: "/music/library" },
    { key: "profile", label: t("music_tabProfile"), icon: "user", href: "/music/profile" },
  ];

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (isMusicHome || pathname === "/music" || pathname.endsWith("/(tabs)/music")) {
          exitToMarket(router);
          return true;
        }
        if (router.canGoBack()) {
          router.back();
          return true;
        }
        exitToMarket(router);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [isMusicHome, pathname, router]),
  );

  const navPad = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="music-shell">
      <View style={styles.header}>
        {showBack ? (
          <Pressable
            onPress={() => exitToMarket(router)}
            style={styles.backBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("music_back")}
            testID="music-back"
          >
            <Feather name="arrow-left" size={22} color={musicTheme.text} />
          </Pressable>
        ) : null}
        <View style={styles.logoWrap} accessibilityRole="header">
          <View style={styles.eq}>
            <View style={[styles.eqBar, { height: 8 }]} />
            <View style={[styles.eqBar, { height: 14 }]} />
            <View style={[styles.eqBar, { height: 10 }]} />
          </View>
          <Text style={styles.brandFlexa}>Flexa </Text>
          <Text style={styles.brandMusic}>Music</Text>
        </View>
        {title ? <Text style={styles.subtitle}>{title}</Text> : null}
        <View style={{ flex: 1 }} />
        {showSearch ? (
          <Pressable
            onPress={() => router.push("/music/search")}
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={t("music_search")}
            testID="music-search"
          >
            <Feather name="search" size={20} color={musicTheme.text} />
          </Pressable>
        ) : null}
        {headerRight}
      </View>
      <View style={styles.body}>{children}</View>
      {showNav ? (
        <View
          style={[styles.nav, { paddingBottom: navPad, height: MUSIC_TAB_BAR_CONTENT + navPad }]}
          testID="music-bottom-nav"
        >
          {tabs.map((item) => {
            const on = tab === item.key;
            return (
              <Pressable
                key={item.key}
                style={styles.navItem}
                onPress={() => router.push(item.href as any)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.navIconWrap, on && styles.navIconOn]}>
                  <Feather name={item.icon} size={20} color={on ? musicTheme.orange : musicTheme.text} />
                </View>
                <Text style={[styles.navLabel, on && styles.navLabelOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: musicTheme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    minHeight: 44,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  eq: { flexDirection: "row", alignItems: "flex-end", gap: 2, marginRight: 2 },
  eqBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: musicTheme.orange,
  },
  brandFlexa: { color: musicTheme.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  brandMusic: { color: musicTheme.emerald, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  subtitle: { color: musicTheme.muted, fontSize: 13, fontWeight: "600", marginLeft: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  nav: {
    flexDirection: "row",
    backgroundColor: musicTheme.secondary,
    borderTopWidth: 1,
    borderTopColor: musicTheme.border,
    paddingTop: 6,
  },
  navItem: { flex: 1, alignItems: "center", gap: 2 },
  navIconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  navIconOn: { backgroundColor: "rgba(255,121,0,0.14)" },
  navLabel: { color: musicTheme.text, fontSize: 10, fontWeight: "600", opacity: 0.75 },
  navLabelOn: { color: musicTheme.orange, opacity: 1, fontWeight: "800" },
});
