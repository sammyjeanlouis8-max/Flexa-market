/**
 * Native Help & Support — `/settings/help` (inventory page 30).
 * Matches website help: support chat entry, mailto, expandable FAQ,
 * Settings header chrome + My Account bottom tabs.
 */
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MainTabBar } from "@/components/shell/MainTabBar";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { useNavigationChrome } from "@/context/NavigationContext";
import { useTabBarHeight } from "@/hooks/useTabContentInsets";
import { fetchUnreadCount as fetchNotifUnread } from "@/lib/notificationsApi";
import { fetchSupportThreads } from "@/lib/supportApi";

const SUPPORT_EMAIL = "support@flexamarket.com";

type FaqItem = { id: string; question: string; answer: string };

export default function SettingsHelpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const { openDrawer } = useNavigationChrome();
  const { token } = useAuth();
  const { count: cartCount } = useCart();
  const { t } = useLanguage();
  const tr = useCallback(
    (key: string, fallback: string) => {
      const value = t(key);
      return !value || value === key ? fallback : value;
    },
    [t],
  );
  const [notifUnread, setNotifUnread] = useState(0);
  const [openingChat, setOpeningChat] = useState(false);
  const [openFaq, setOpenFaq] = useState<string>("list");
  const [latestSupportId, setLatestSupportId] = useState<number | null>(null);

  React.useEffect(() => {
    if (!token) {
      setNotifUnread(0);
      setLatestSupportId(null);
      return;
    }
    let cancelled = false;
    void fetchNotifUnread({ token })
      .then((n) => {
        if (!cancelled) setNotifUnread(n);
      })
      .catch(() => {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    void fetchSupportThreads({ token, signal: controller.signal })
      .then((threads) => {
        if (cancelled) return;
        const sorted = [...threads].sort((a, b) => {
          const ta = Date.parse(String(a.lastMessageAt || a.updatedAt || a.createdAt || 0));
          const tb = Date.parse(String(b.lastMessageAt || b.updatedAt || b.createdAt || 0));
          return tb - ta;
        });
        setLatestSupportId(sorted[0]?.id != null ? Number(sorted[0].id) : null);
      })
      .catch(() => {
        if (!cancelled) setLatestSupportId(null);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [token]);

  const faqs: FaqItem[] = useMemo(
    () => [
      {
        id: "list",
        question: tr("helpFaqListQ", "How do I list something for sale?"),
        answer: tr(
          "helpFaqListA",
          "Tap Sell, add a few photos, write a title and price, then publish. Your listing appears for buyers in your country within seconds.",
        ),
      },
      {
        id: "payments",
        question: tr("helpFaqPayQ", "How do payments work?"),
        answer: tr(
          "helpFaqPayA",
          "In Haiti and a few other countries, payments are in cash, in person. In the US and other supported countries you can pay with card or crypto. Commission fees are shown before you pay.",
        ),
      },
      {
        id: "verified",
        question: tr("helpFaqVerifiedQ", "How do I become a verified seller?"),
        answer: tr(
          "helpFaqVerifiedA",
          "Verify your phone in Edit Profile. The more sales and reviews you accumulate, the more visibility you get.",
        ),
      },
      {
        id: "boost",
        question: tr("helpFaqBoostQ", "How do I boost a listing?"),
        answer: tr(
          "helpFaqBoostA",
          "On the listing page, tap Boost. Boosted listings appear at the top of the feed and unlock a direct WhatsApp contact button.",
        ),
      },
    ],
    [tr],
  );

  const goBackToSettings = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  }, [router]);

  const goToSupport = useCallback(
    (id: number | null) => {
      // Absolute path out of the nested settings stack (root Stack.Screen "support/[id]").
      if (id != null) {
        router.push({ pathname: "/support/[id]", params: { id: String(id) } });
      } else {
        router.push("/support");
      }
    },
    [router],
  );

  const openSupportChat = useCallback(async () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    // Prefer the prefetched thread so the tap feels instant and survives API 429s.
    if (latestSupportId != null) {
      goToSupport(latestSupportId);
      return;
    }
    setOpeningChat(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const threads = await fetchSupportThreads({
        token,
        signal: controller.signal,
      });
      const sorted = [...threads].sort((a, b) => {
        const ta = Date.parse(String(a.lastMessageAt || a.updatedAt || a.createdAt || 0));
        const tb = Date.parse(String(b.lastMessageAt || b.updatedAt || b.createdAt || 0));
        return tb - ta;
      });
      const id = sorted[0]?.id != null ? Number(sorted[0].id) : null;
      if (id != null) setLatestSupportId(id);
      goToSupport(id);
    } catch {
      goToSupport(null);
    } finally {
      clearTimeout(timer);
      setOpeningChat(false);
    }
  }, [token, router, latestSupportId, goToSupport]);

  const emailSupport = useCallback(async () => {
    const url = `mailto:${SUPPORT_EMAIL}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      /* fall through to copy */
    }
    try {
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      Alert.alert(
        tr("helpEmailCopiedTitle", "Email copied"),
        tr(
          "helpEmailCopiedBody",
          "No email app was available. support@flexamarket.com was copied to your clipboard.",
        ),
      );
    } catch {
      Alert.alert(tr("helpEmailFallbackTitle", "Contact Support"), SUPPORT_EMAIL);
    }
  }, [tr]);

  return (
    <View style={styles.root} testID="settings-help-screen">
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.headerIcon}
              onPress={openDrawer}
              accessibilityLabel="Open menu"
            >
              <Feather name="menu" size={22} color="#0F172A" />
            </Pressable>
            <Pressable
              style={styles.headerIcon}
              onPress={goBackToSettings}
              accessibilityLabel="Go back"
            >
              <Feather name="arrow-left" size={22} color="#0F172A" />
            </Pressable>
            <Text style={styles.headerTitle}>{tr("helpHeaderTitle", "Help")}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push(token ? "/(tabs)/profile" : "/auth/login")}
              accessibilityLabel="Profile"
            >
              <Feather name="user" size={20} color="#0F172A" />
            </Pressable>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push("/notifications")}
              accessibilityLabel="Notifications"
            >
              <Feather name="bell" size={20} color="#0F172A" />
              {notifUnread > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {notifUnread > 99 ? "99+" : String(notifUnread)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push("/(tabs)/cart")}
              accessibilityLabel="Cart"
            >
              <Feather name="shopping-cart" size={20} color="#0F172A" />
              {cartCount > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {cartCount > 99 ? "99+" : String(cartCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: tabBarHeight + 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={goBackToSettings} accessibilityRole="link">
          <Text style={styles.backLink}>
            ← {tr("helpBackToSettings", "Back to Settings")}
          </Text>
        </Pressable>

        <Text style={styles.pageTitle}>{tr("sHelpSupport", "Help & Support")}</Text>
        <Text style={styles.pageSub}>
          {tr("helpSubtitle", "Get fast answers or reach our team.")}
        </Text>

        <View style={styles.chatCard}>
          <View style={styles.chatIcon}>
            <Feather name="message-circle" size={18} color="#2563EB" />
          </View>
          <View style={styles.chatText}>
            <Text style={styles.chatTitle}>{tr("helpSupportTitle", "Support")}</Text>
            <Text style={styles.chatBody}>
              {tr(
                "helpSupportBody",
                "Send a message to the FLEXA MARKET team. We'll respond as soon as possible.",
              )}
            </Text>
          </View>
          <Pressable
            style={styles.chatBtn}
            onPress={() => void openSupportChat()}
            disabled={openingChat}
            accessibilityLabel="Open chat"
          >
            {openingChat ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.chatBtnText}>{tr("helpOpenChat", "Open chat")}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.emailCard}>
          <View style={styles.emailIcon}>
            <Feather name="mail" size={16} color="#64748B" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.emailTitle}>{tr("helpContactTitle", "Contact Support")}</Text>
            <Text style={styles.emailAddress}>{SUPPORT_EMAIL}</Text>
          </View>
          <Pressable onPress={() => void emailSupport()} accessibilityLabel="Email us">
            <Text style={styles.emailLink}>{tr("helpEmailUs", "Email us")}</Text>
          </Pressable>
        </View>

        <Text style={styles.faqHeading}>
          {tr("helpFaqHeading", "FREQUENTLY ASKED QUESTIONS")}
        </Text>
        <View style={styles.faqCard}>
          {faqs.map((item, idx) => {
            const expanded = openFaq === item.id;
            return (
              <View
                key={item.id}
                style={[styles.faqRow, idx < faqs.length - 1 && styles.faqBorder]}
              >
                <Pressable
                  style={styles.faqHeader}
                  onPress={() => setOpenFaq(expanded ? "" : item.id)}
                  accessibilityState={{ expanded }}
                >
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  <Feather
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#94A3B8"
                  />
                </Pressable>
                {expanded ? <Text style={styles.faqAnswer}>{item.answer}</Text> : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.tabDock}>
        <MainTabBar active="account" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginLeft: 2,
  },
  notifBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  scroll: { flex: 1 },
  backLink: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 10,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  pageSub: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 14,
    color: "#64748B",
  },
  chatCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  chatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  chatText: { flex: 1, minWidth: 0 },
  chatTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  chatBody: { fontSize: 12, color: "#475569", marginTop: 2, lineHeight: 17 },
  chatBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 92,
    alignItems: "center",
  },
  chatBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  emailCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  emailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  emailTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  emailAddress: { fontSize: 12, color: "#64748B", marginTop: 2 },
  emailLink: { color: "#2563EB", fontWeight: "800", fontSize: 14 },
  faqHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  faqCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  faqRow: { paddingHorizontal: 14, paddingVertical: 12 },
  faqBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  faqAnswer: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  tabDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
