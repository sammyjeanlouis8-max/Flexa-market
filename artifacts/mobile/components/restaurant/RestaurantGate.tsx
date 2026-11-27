import { useRouter } from "expo-router";
import React, { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { canAccessRestaurant, RESTAURANT_PUBLIC_LAUNCH } from "@/lib/restaurantAccess";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

/** Super Admin–only while RESTAURANT_PUBLIC_LAUNCH is false. */
export function RestaurantGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const allowed = canAccessRestaurant(user as any);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login" as any);
      return;
    }
    if (!allowed) {
      router.replace("/" as any);
    }
  }, [isLoading, user, allowed, router]);

  if (isLoading || !user) {
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
            || (RESTAURANT_PUBLIC_LAUNCH
              ? t("restaurant_notFound")
              : "Flexa Restaurant is in Super Admin preview only.")}
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
