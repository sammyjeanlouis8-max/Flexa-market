import { useRouter } from "expo-router";
import React, { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { canAccessRestaurant } from "@/lib/restaurantAccess";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import { RestaurantShell } from "./RestaurantShell";

/** Auth + browse gate for Flexa Restaurant. */
export function RestaurantGate({ children }: { children: ReactNode }) {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessRestaurant(user);

  useEffect(() => {
    if (isLoading) return;
    if (!token) {
      router.replace("/auth/login");
    }
  }, [isLoading, token, router]);

  if (isLoading || !token) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <RestaurantShell title="Flexa Restaurant" subtitle="Sign in required">
        <View style={styles.card}>
          <Text style={styles.title}>Sign in to browse restaurants</Text>
          <Text style={styles.body}>
            Flexa Restaurant needs your Market account to show daily menus and owner tools.
          </Text>
        </View>
      </RestaurantShell>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.mintSoft },
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 16, fontWeight: "800", color: T.ink },
  body: { marginTop: 8, fontSize: 14, color: T.muted, lineHeight: 20 },
});
