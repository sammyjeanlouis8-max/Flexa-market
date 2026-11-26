import { useLanguage } from "@/context/LanguageContext";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleBlockedScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_blockedTitle")} subtitle={t("wholesale_blockedSubtitle")}>
        <View style={styles.empty}>
          <Feather name="slash" size={28} color={T.accent} />
          <Text style={styles.title}>No blocked sellers</Text>
          <Text style={styles.body}>
            When you block a wholesale seller from chat, they appear here. Blocking stops new inquiries on depot listings — existing closed deals stay in your history.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.push("/wholesale/inquiries")}>
            <Text style={styles.ctaText}>Back to inquiries</Text>
          </Pressable>
        </View>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    borderRadius: 16,
    backgroundColor: T.white,
  },
  title: { marginTop: 10, fontSize: 15, fontWeight: "800", color: T.ink },
  body: { marginTop: 6, fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  cta: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 13 },
});
