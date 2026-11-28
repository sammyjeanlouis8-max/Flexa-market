import { usePathname, useRouter } from "expo-router";
import React, { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { canAccessRestaurant, RESTAURANT_PUBLIC_LAUNCH } from "@/lib/restaurantAccess";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

/** Public browse when RESTAURANT_PUBLIC_LAUNCH; owner/order paths require login. */
export function RestaurantGate({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname() || "";
  const allowed = canAccessRestaurant(user as any);
  const pathNeedsAuth =
    pathname.includes("/owner") ||
    pathname.includes("/add") ||
    pathname.includes("/checkout") ||
    pathname.includes("/orders") ||
    pathname.includes("/reservations") ||
    pathname.includes("/identity") ||
    pathname.includes("/food-safety") ||
    pathname.includes("/daily-menu") ||
    pathname.includes("/dish-models") ||
    pathname.includes("/settings");
  const needsAuth = requireAuth || pathNeedsAuth || !RESTAURANT_PUBLIC_LAUNCH;

  useEffect(() => {
    if (isLoading) return;
    if (needsAuth && !user) {
      router.replace("/login" as any);
      return;
    }
    if (user && !allowed) {
      router.replace("/" as any);
    }
  }, [isLoading, needsAuth, user, allowed, router]);

  if (isLoading || (needsAuth && !user)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>
          {t("restaurant_staffPreviewOnly")
            || "Flexa Restaurant is in Super Admin preview only."}
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: T.mintSoft },
  text: { color: T.muted, textAlign: "center", fontSize: 14, lineHeight: 20 },
});
