import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { LANGUAGES, useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { t, lang } = useLanguage();
  const currentLangLabel = LANGUAGES.find((l) => l.code === lang)?.native ?? lang;
  const [notifEnabled, setNotifEnabled] = useState(true);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  function handleLogout() {
    Alert.alert(t("logoutTitle"), t("logoutMsg"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("sLogout"),
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/auth/login");
        },
      },
    ]);
  }

  function handleLanguagePick() {
    router.push("/language-picker");
  }

  type SettingItem = {
    icon: string;
    label: string;
    sublabel?: string;
    onPress: () => void;
    danger?: boolean;
    badge?: string;
  };

  type SettingSection = {
    title: string;
    items: SettingItem[];
  };

  const sections: SettingSection[] = [
    {
      title: t("sAccount"),
      items: [
        {
          icon: "user",
          label: t("sEditProfile"),
          sublabel: user?.name,
          onPress: () => Alert.alert(t("sEditProfile"), t("sEditProfileHint"), [{ text: t("ok") }]),
        },
        {
          icon: "lock",
          label: t("sPasswordSecurity"),
          onPress: () => Alert.alert(t("sPasswordSecurity"), t("sPasswordSecurityHint"), [{ text: t("ok") }]),
        },
        {
          icon: "shield",
          label: t("sKyc"),
          sublabel: user?.kycStatus ?? t("notVerifiedKyc"),
          badge: user?.kycStatus === "approved" ? `✓ ${t("verified")}` : undefined,
          onPress: () => router.push("/kyc"),
        },
        {
          icon: "phone",
          label: t("sPhone"),
          sublabel: user?.phone ?? t("notVerifiedKyc"),
          onPress: () => Alert.alert(t("sPhone"), t("sPhoneHint"), [{ text: t("ok") }]),
        },
      ],
    },
    {
      title: t("sPreferences"),
      items: [
        {
          icon: "bell",
          label: t("sNotifications"),
          sublabel: notifEnabled ? t("sNotifOn") : t("sNotifOff"),
          onPress: () => setNotifEnabled((v) => !v),
        },
        {
          icon: "globe",
          label: t("sLanguage"),
          sublabel: currentLangLabel,
          onPress: handleLanguagePick,
        },
        {
          icon: "moon",
          label: t("sAppearance"),
          sublabel: t("sDarkMode"),
          onPress: () => {},
        },
      ],
    },
    {
      title: t("sFinances"),
      items: [
        {
          icon: "credit-card",
          label: t("sWalletFM"),
          onPress: () => router.push("/wallet"),
        },
        {
          icon: "send",
          label: t("sPayoutAccount"),
          onPress: () => Alert.alert(t("sPayoutAccount"), t("sPayoutAccountHint"), [{ text: t("ok") }]),
        },
      ],
    },
    {
      title: t("sSupport"),
      items: [
        {
          icon: "help-circle",
          label: t("sHelpSupport"),
          onPress: () => Alert.alert("FlexaMarket", t("sHelpSupportHint"), [{ text: t("ok") }]),
        },
        {
          icon: "file-text",
          label: t("sTerms"),
          onPress: () => Alert.alert(t("sTerms"), t("sTermsHint"), [{ text: t("ok") }]),
        },
        {
          icon: "info",
          label: t("sAbout"),
          sublabel: "v1.0.0",
          onPress: () => Alert.alert("FLEXA MARKET", t("sAboutMsg"), [{ text: t("ok") }]),
        },
      ],
    },
    {
      title: "",
      items: [
        {
          icon: "log-out",
          label: t("sLogout"),
          danger: true,
          onPress: handleLogout,
        },
      ],
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("mySettings")}</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {user && (
          <Pressable
            style={[styles.profileBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{user.name?.slice(0, 2).toUpperCase() ?? "?"}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.foreground }]}>{user.name}</Text>
              <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}

        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            {section.title ? (
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{section.title}</Text>
            ) : null}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.items.map((item, ii, arr) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.settingRow,
                    ii < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                  onPress={item.onPress}
                >
                  <View style={[styles.iconWrap, { backgroundColor: item.danger ? colors.destructive + "22" : colors.muted }]}>
                    <Feather
                      name={item.icon as any}
                      size={17}
                      color={item.danger ? colors.destructive : colors.primary}
                    />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={[styles.rowLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{item.sublabel}</Text>
                    ) : null}
                  </View>
                  {item.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  ) : (
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileBanner: { flexDirection: "row", alignItems: "center", margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  avatarCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  sectionCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  badge: { backgroundColor: "#22C55E22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22C55E" },
});
