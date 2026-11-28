import { useRouter } from "expo-router";
import React, { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { BEAUTY_PUBLIC_LAUNCH, canAccessBeauty } from "@/lib/beautyAccess";
import { beautyTheme as T } from "@/lib/beautyTheme";

/** Super Admin–only while BEAUTY_PUBLIC_LAUNCH is false. */
export function BeautyGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const allowed = canAccessBeauty(user as any);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/auth/login" as any);
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
          {t("beauty_staffPreviewOnly")
            || (BEAUTY_PUBLIC_LAUNCH
              ? t("beauty_notFound")
              : "Séduire Beauty is in Super Admin preview only.")}
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: T.blushSoft },
  text: { color: T.muted, textAlign: "center", fontSize: 14, lineHeight: 20 },
});
