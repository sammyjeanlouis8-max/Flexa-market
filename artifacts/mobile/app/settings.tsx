import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { NavLink } from "@/components/NavLink";
import { SignInGate } from "@/components/SignInGate";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const { token, user, logout } = useAuth();
  const colors = useColors();

  if (!token) {
    return (
      <NativeScreen title="Settings" subtitle="Manage your Flexa Market account.">
        <SignInGate message="Sign in to open settings." />
      </NativeScreen>
    );
  }

  return (
    <NativeScreen title="Settings" subtitle="Native account settings. English is the default language.">
      <StatusCard
        label="Signed in as"
        value={user?.name || user?.email || "User"}
        detail={user?.email}
        tone="ok"
      />
      <View style={{ gap: 10 }}>
        <NavLink href="/edit-profile" label="Edit profile" />
        <NavLink href="/language-picker" label="Language" detail="English default · other locales kept" />
        <NavLink href="/notifications" label="Notifications" />
        <NavLink href="/subscription" label="Subscriptions" detail="Apple IAP via RevenueCat on iOS" />
        <NavLink href="/kyc" label="Identity verification (KYC)" />
        <NavLink href="/wallet" label="Wallet" />
      </View>
      <Pressable
        onPress={() => void logout()}
        style={[styles.btn, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>Sign out</Text>
      </Pressable>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
