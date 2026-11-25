import { useRouter } from "expo-router";
import React, { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { canAccessWholesale } from "@/lib/wholesaleAccess";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";
import { WholesaleShell } from "./WholesaleShell";

/** Super Admin gate until WHOLESALE_PUBLIC_LAUNCH. Shared Market auth session. */
export function WholesaleGate({ children }: { children: ReactNode }) {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const allowed = canAccessWholesale(user);

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
      <WholesaleShell title="Flexa Wholesale" subtitle="Preview access restricted">
        <View style={styles.card}>
          <Text style={styles.title}>Super Admin only</Text>
          <Text style={styles.body}>
            Flexa Wholesale is in preview on the shared Market database. Flip
            WHOLESALE_PUBLIC_LAUNCH when ready for all users.
          </Text>
        </View>
      </WholesaleShell>
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
