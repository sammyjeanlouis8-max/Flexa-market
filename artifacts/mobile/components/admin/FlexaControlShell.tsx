import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAdminControl } from "@/context/AdminControlContext";
import { useTheme } from "@/context/ThemeContext";
import { BOTTOM_TABS } from "@/lib/adminModules";
import colors from "@/constants/colors";

function GateState({
  title,
  subtitle,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
  return (
    <View style={styles.gate}>
      <Feather name={icon} size={40} color="#94A3B8" />
      <Text style={styles.gateTitle}>{title}</Text>
      <Text style={styles.gateSub}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.gateBtn} onPress={onAction}>
          <Text style={styles.gateBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FlexaControlShell({
  children,
  activeTab,
}: {
  children: ReactNode;
  activeTab?: (typeof BOTTOM_TABS)[number]["id"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { toggleDark, isDark } = useTheme();
  const {
    phase,
    errorMessage,
    roleLabel,
    refreshAccess,
  } = useAdminControl();

  const tab =
    activeTab ??
    (BOTTOM_TABS.find((t) => t.href !== "/admin" && pathname?.startsWith(t.href))?.id ||
      "dashboard");

  if (phase === "boot" || phase === "checking") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Flexa Control</Text>
          <Text style={styles.headerSub}>Restoring session…</Text>
        </View>
        <View style={styles.gate}>
          <ActivityIndicator size="large" color={colors.flexaGreen} />
          <Text style={styles.gateSub}>Loading permissions…</Text>
        </View>
      </View>
    );
  }

  if (phase === "unauthenticated" || phase === "session_expired") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Flexa Control</Text>
          </View>
        </View>
        <GateState
          title={phase === "session_expired" ? "Session expired" : "Sign in required"}
          subtitle={
            phase === "session_expired"
              ? "Your staff session ended. Sign in again to continue."
              : "Sign in with a staff account to open Flexa Control."
          }
          actionLabel="Sign in"
          onAction={() => router.replace("/auth/login")}
          icon="lock"
        />
      </View>
    );
  }

  if (phase === "network_error") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Flexa Control</Text>
          </View>
        </View>
        <GateState
          title="Couldn't load permissions"
          subtitle={errorMessage || "Check your connection and try again."}
          actionLabel="Retry"
          onAction={() => void refreshAccess()}
          icon="wifi"
        />
      </View>
    );
  }

  if (phase === "denied") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Flexa Control</Text>
          </View>
        </View>
        <GateState
          title="Access denied"
          subtitle={errorMessage || "Admin or support role required."}
          actionLabel="Go home"
          onAction={() => router.replace("/")}
          icon="shield-off"
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/admin/more")}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Open modules menu"
        >
          <Feather name="layout" size={20} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, paddingHorizontal: 8 }}>
          <Text style={styles.headerTitle}>Flexa Control</Text>
          <Text style={styles.headerSub}>Command Center · {roleLabel}</Text>
        </View>
        <Pressable
          onPress={() => router.push("/admin/more")}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="All modules"
        >
          <Feather name="grid" size={20} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/notifications")}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Notifications"
        >
          <Feather name="bell" size={20} color="#fff" />
        </Pressable>
        <Pressable onPress={toggleDark} hitSlop={12} style={styles.iconBtn} accessibilityLabel="Toggle theme">
          <Feather name={isDark ? "sun" : "moon"} size={20} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.body}>{children}</View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {BOTTOM_TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={styles.tabItem}
              onPress={() => {
                if (t.href === "/admin") router.replace("/admin");
                else router.push(t.href as any);
              }}
            >
              <Feather name={t.icon} size={20} color={on ? colors.flexaGreen : "#94A3B8"} />
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    backgroundColor: colors.flexaGreen,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 2,
  },
  iconBtn: { padding: 8 },
  headerTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 1 },
  body: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: "center", gap: 2 },
  tabLabel: { fontSize: 10, color: "#94A3B8", fontWeight: "600" },
  tabLabelOn: { color: colors.flexaGreen, fontWeight: "800" },
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 10,
  },
  gateTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  gateSub: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
  gateBtn: {
    marginTop: 8,
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  gateBtnText: { color: "#fff", fontWeight: "800" },
});
