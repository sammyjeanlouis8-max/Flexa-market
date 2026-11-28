import { usePathname, useRouter } from "expo-router";
import React, { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { canAccessWholesale, WHOLESALE_PUBLIC_LAUNCH } from "@/lib/wholesaleAccess";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";
import { WholesaleShell } from "./WholesaleShell";

/** Public browse when WHOLESALE_PUBLIC_LAUNCH; seller/admin paths still require login. */
export function WholesaleGate({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "";
  const allowed = canAccessWholesale(user);
  const pathNeedsAuth =
    pathname.includes("/seller") ||
    pathname.includes("/admin") ||
    pathname.includes("/favorites") ||
    pathname.includes("/inquiries") ||
    pathname.includes("/quotes") ||
    pathname.includes("/verification");
  const needsAuth = requireAuth || pathNeedsAuth || !WHOLESALE_PUBLIC_LAUNCH;

  useEffect(() => {
    if (isLoading) return;
    if (needsAuth && !token) {
      router.replace("/auth/login");
    }
  }, [isLoading, needsAuth, token, router]);

  if (isLoading || (needsAuth && !token)) {
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
          <Text style={styles.title}>Staff preview only</Text>
          <Text style={styles.body}>
            Flexa Wholesale is not publicly available yet.
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
