import { Feather } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { musicTheme } from "@/lib/musicTheme";

type TabKey = "home" | "explore" | "library" | "upload";

const TABS: { key: TabKey; label: string; icon: keyof typeof Feather.glyphMap; href: string }[] = [
  { key: "home", label: "Home", icon: "home", href: "/(tabs)/music" },
  { key: "explore", label: "Explore", icon: "search", href: "/music/search" },
  { key: "library", label: "Library", icon: "heart", href: "/music/library" },
  { key: "upload", label: "Add", icon: "plus-circle", href: "/music/upload" },
];

function activeTab(pathname: string): TabKey {
  if (pathname.includes("/music/search")) return "explore";
  if (pathname.includes("/music/library") || pathname.includes("/music/playlists")) return "library";
  if (pathname.includes("/music/upload")) return "upload";
  return "home";
}

export function MusicShell({
  title,
  children,
  showNav = true,
  headerRight,
}: {
  title?: string;
  children: ReactNode;
  showNav?: boolean;
  headerRight?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const tab = activeTab(pathname);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>Flexa Music</Text>
        {title ? <Text style={styles.subtitle}>{title}</Text> : null}
        <View style={{ flex: 1 }} />
        {headerRight}
      </View>
      <View style={styles.body}>{children}</View>
      {showNav ? (
        <View style={[styles.nav, { paddingBottom: insets.bottom + 8 }]}>
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={styles.navItem}
                onPress={() => router.push(t.href as any)}
                accessibilityRole="button"
              >
                <Feather name={t.icon} size={20} color={on ? musicTheme.orange : musicTheme.muted} />
                <Text style={[styles.navLabel, on && styles.navLabelOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: musicTheme.charcoal },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  brand: { color: musicTheme.white, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { color: musicTheme.muted, fontSize: 14, fontWeight: "600" },
  body: { flex: 1 },
  nav: {
    flexDirection: "row",
    backgroundColor: musicTheme.forest,
    borderTopWidth: 1,
    borderTopColor: musicTheme.line,
    paddingTop: 10,
  },
  navItem: { flex: 1, alignItems: "center", gap: 4 },
  navLabel: { color: musicTheme.muted, fontSize: 10, fontWeight: "700" },
  navLabelOn: { color: musicTheme.orange },
});