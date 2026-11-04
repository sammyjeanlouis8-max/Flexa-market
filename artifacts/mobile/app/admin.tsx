import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { NavLink } from "@/components/NavLink";
import { SignInGate } from "@/components/SignInGate";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

/** Native admin hub — role-gated entry to admin-related native screens. */
export default function AdminScreen() {
  const { token, user } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const isAdmin = Boolean(user?.isAdmin || user?.isSuperAdmin || user?.role === "admin");

  if (!token) {
    return (
      <NativeScreen title="Admin" subtitle="Restricted area.">
        <SignInGate message="Sign in with an admin account." />
      </NativeScreen>
    );
  }

  if (!isAdmin) {
    return (
      <NativeScreen title="Admin" subtitle="You do not have admin access.">
        <StatusCard
          label="Access"
          value="Denied"
          detail="Only admin and super-admin roles can open this hub."
          tone="warn"
        />
        <Pressable
          onPress={() => router.back()}
          style={[styles.btn, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>Back</Text>
        </Pressable>
      </NativeScreen>
    );
  }

  return (
    <NativeScreen
      title="Admin"
      subtitle="Native admin hub. Deep admin panels migrate screen-by-screen."
    >
      <StatusCard
        label="Role"
        value={user?.isSuperAdmin ? "Super admin" : "Admin"}
        detail={user?.email || undefined}
        tone="ok"
      />
      <View style={{ gap: 10 }}>
        <NavLink href="/orders" label="Orders overview" detail="Purchases & sales APIs" />
        <NavLink href="/delivery-tracking" label="Deliveries" detail="Native delivery tracking" />
        <NavLink href="/wallet" label="Wallet monitor entry" detail="Opens native wallet" />
        <NavLink href="/music" label="Music catalog" />
        <NavLink href="/tv" label="TV schedule" />
        <NavLink href="/notifications" label="Notifications" />
      </View>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
