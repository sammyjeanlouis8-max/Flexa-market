/**
 * Help Center — static topics + live support knowledge articles.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchSupportKnowledge, type KnowledgeItem } from "@/lib/supportApi";

type Topic = {
  titleKey: string;
  bodyKey: string;
  route?: string;
};

const TOPICS: Topic[] = [
  { titleKey: "helpOrdersTitle", bodyKey: "helpOrdersBody", route: "/orders" },
  { titleKey: "helpPaymentsTitle", bodyKey: "helpPaymentsBody", route: "/wallet" },
  { titleKey: "helpChatTitle", bodyKey: "helpChatBody", route: "/inbox" },
  { titleKey: "helpRecoveryTitle", bodyKey: "helpRecoveryBody", route: "/auth/forgot-password" },
  { titleKey: "helpSupportTitle", bodyKey: "helpSupportBody", route: "/support" },
  { titleKey: "helpBotTitle", bodyKey: "helpBotBody", route: "/chatbot" },
  { titleKey: "helpDeleteTitle", bodyKey: "helpDeleteBody", route: "/delete-account" },
];

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useLanguage();
  const [faq, setFaq] = useState<KnowledgeItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setFaq([]);
        return;
      }
      void fetchSupportKnowledge({ token })
        .then((items) => setFaq(items.slice(0, 12)))
        .catch(() => setFaq([]));
    }, [token]),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("helpTitle")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.lead}>{t("helpLead")}</Text>

        {TOPICS.map((topic) => (
          <Pressable
            key={topic.titleKey}
            style={styles.card}
            onPress={() => (topic.route ? router.push(topic.route as any) : undefined)}
          >
            <Text style={styles.cardTitle}>{t(topic.titleKey)}</Text>
            <Text style={styles.cardBody}>{t(topic.bodyKey)}</Text>
            <View style={styles.cardLink}>
              <Text style={styles.cardLinkText}>{t("open")}</Text>
              <Feather name="chevron-right" size={16} color="#F97316" />
            </View>
          </Pressable>
        ))}

        {faq.length ? (
          <>
            <Text style={styles.section}>{t("supportFaq")}</Text>
            {faq.map((item, i) => (
              <Pressable
                key={`${item.slug || item.title}-${i}`}
                style={styles.card}
                onPress={() =>
                  Alert.alert(item.title, item.body.slice(0, 1200), [
                    item.deepLink
                      ? { text: t("open"), onPress: () => router.push(item.deepLink as any) }
                      : undefined,
                    { text: t("ok") },
                  ].filter(Boolean) as any)
                }
              >
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#0F172A" },
  content: { paddingHorizontal: 16, gap: 10 },
  lead: { color: "#64748B", fontSize: 13, lineHeight: 18, marginBottom: 4 },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 8, marginBottom: 2 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A", fontSize: 15 },
  cardBody: { color: "#64748B", fontSize: 13, lineHeight: 18 },
  cardLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  cardLinkText: { color: "#F97316", fontWeight: "800", fontSize: 13 },
});
