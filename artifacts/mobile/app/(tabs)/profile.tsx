import { useAuth } from "@/context/AuthContext";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileTab() {
  const { user, token, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Account</Text>
          <Text style={styles.muted}>Sign in to manage listings, orders, and messages.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/auth/login")}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/auth/register")}>
            <Text style={styles.secondaryText}>Create account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.pad}>
        <Text style={styles.brand}>Flexa Market</Text>
        <Text style={styles.title}>{user.name}</Text>
        <Text style={styles.muted}>{user.email}</Text>
        {user.country ? <Text style={styles.meta}>Marketplace: {user.country}</Text> : null}

        <View style={styles.menu}>
          <MenuRow icon="package" label="My listings" onPress={() => router.push("/my-listings")} />
          <MenuRow icon="heart" label="Favorites" onPress={() => router.push("/favorites")} />
          <MenuRow icon="shopping-bag" label="Orders" onPress={() => router.push("/orders")} />
          <MenuRow icon="settings" label="Settings" onPress={() => router.push("/settings")} />
        </View>

        <Pressable
          style={styles.logout}
          onPress={async () => {
            await logout();
          }}
        >
          <Feather name="log-out" size={16} color="#FCA5A5" />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Feather name={icon} size={18} color="#F8FAFC" />
      <Text style={styles.rowText}>{label}</Text>
      <Feather name="chevron-right" size={18} color="#64748B" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  pad: { padding: 16, gap: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  title: { fontSize: 20, fontWeight: "700", color: "#F97316", marginTop: 4 },
  muted: { color: "#94A3B8", fontSize: 14, marginBottom: 8 },
  meta: { color: "#CBD5E1", fontSize: 13 },
  primary: {
    marginTop: 12,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryText: { color: "#F8FAFC", fontWeight: "600", fontSize: 15 },
  menu: { marginTop: 20, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowText: { flex: 1, color: "#F8FAFC", fontSize: 15, fontWeight: "600" },
  logout: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  logoutText: { color: "#FCA5A5", fontWeight: "600" },
});
