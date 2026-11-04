import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { NavLink } from "@/components/NavLink";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { LOANS_NAV_VISIBLE } from "@/lib/featureFlags";

/** Default UI language: English. Loan nav intentionally hidden. */
export default function ProfileTab() {
  const colors = useColors();
  const router = useRouter();
  const { user, token, isLoading, logout } = useAuth();

  return (
    <NativeScreen
      title="Profile"
      subtitle="Native session with JWT in SecureStore. No WebView."
    >
      <StatusCard
        label="User"
        value={
          isLoading
            ? "Loading…"
            : user?.name || user?.email || (token ? "Signed in" : "Guest")
        }
        detail={
          user?.email
            ? user.email
            : token
              ? "JWT token active"
              : "Sign in to manage favorites, orders, and messages"
        }
        tone={token ? "ok" : "neutral"}
      />

      {user?.role ? (
        <StatusCard label="Role" value={String(user.role)} tone="ok" />
      ) : null}

      <View style={styles.actions}>
        {!token ? (
          <>
            <Pressable
              onPress={() => router.push("/auth/login")}
              style={[styles.primary, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryText}>Sign in</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/auth/register")}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Create account
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={{ gap: 10 }}>
            <NavLink href="/favorites" label="Favorites" />
            <NavLink href="/wallet" label="Wallet" />
            <NavLink href="/flex-card" label="Flexa Card" />
            <NavLink href="/orders" label="Orders" />
            <NavLink href="/sales" label="Seller dashboard" />
            <NavLink href="/subscription" label="Subscriptions (Apple IAP)" />
            <NavLink href="/music" label="Flexa Music" />
            <NavLink href="/tv" label="Flexa TV" />
            <NavLink href="/notifications" label="Notifications" />
            <NavLink href="/settings" label="Settings" />
            <NavLink href="/offers" label="Offers" />
            {(user?.isAdmin || user?.isSuperAdmin) && (
              <NavLink href="/admin" label="Admin" />
            )}
            {/* Loan stays available as /loans route code, but never linked while flag is false. */}
            {LOANS_NAV_VISIBLE ? <NavLink href="/loans" label="Loans" /> : null}
            <Pressable
              onPress={() => void logout()}
              style={[styles.secondary, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Sign out
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: 8 },
  primary: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#0F172A", fontWeight: "700", fontSize: 15 },
  secondary: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
});
