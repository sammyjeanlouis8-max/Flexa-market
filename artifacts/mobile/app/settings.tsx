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
import { useColors } from "@/hooks/useColors";

type SettingSection = {
  title: string;
  items: SettingItem[];
};

type SettingItem = {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
  badge?: string;
};

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [notifEnabled, setNotifEnabled] = useState(true);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  function handleLogout() {
    Alert.alert("Dekonekte", "Ou sèten ou vle dekonekte?", [
      { text: "Anile", style: "cancel" },
      {
        text: "Dekonekte",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/auth/login");
        },
      },
    ]);
  }

  const sections: SettingSection[] = [
    {
      title: "Kont",
      items: [
        {
          icon: "user",
          label: "Modifye Pwofil",
          sublabel: user?.name,
          onPress: () => Alert.alert("Modifye Pwofil", "Ouvè sit entènèt FlexaMarket pou modifye pwofil ou a.", [{ text: "OK" }]),
        },
        {
          icon: "lock",
          label: "Modpas & Sekirite",
          onPress: () => Alert.alert("Modpas & Sekirite", "Ale nan Paramèt → Sekirite sou sit entènèt FlexaMarket pou chanje modpas ou.", [{ text: "OK" }]),
        },
        {
          icon: "shield",
          label: "Verifikasyon Idantite (KYC)",
          sublabel: user?.kycStatus ?? "Pa verifye",
          badge: user?.kycStatus === "approved" ? "✓ Verifye" : undefined,
          onPress: () => router.push("/kyc"),
        },
        {
          icon: "phone",
          label: "Telefòn & OTP",
          sublabel: user?.phone ?? "Pa defini",
          onPress: () => Alert.alert("Telefòn & OTP", "Kontakte sipò FlexaMarket pou chanje nimewo telefòn ou.", [{ text: "OK" }]),
        },
      ],
    },
    {
      title: "Preferans",
      items: [
        {
          icon: "bell",
          label: "Notifikasyon",
          sublabel: notifEnabled ? "Aktif" : "Dezaktive",
          onPress: () => setNotifEnabled((v) => !v),
        },
        {
          icon: "globe",
          label: "Lang",
          sublabel: "Kreyòl ayisyen",
          onPress: () => {},
        },
        {
          icon: "moon",
          label: "Aparans",
          sublabel: "Mode nwa",
          onPress: () => {},
        },
      ],
    },
    {
      title: "Finans",
      items: [
        {
          icon: "credit-card",
          label: "Pòtfèy FM",
          onPress: () => router.push("/wallet"),
        },
        {
          icon: "send",
          label: "Kont Peman Vandè",
          onPress: () => Alert.alert("Kont Peman Vandè", "Konfigire kont MonCash ak Bank ou nan Paramèt sou sit entènèt FlexaMarket.", [{ text: "OK" }]),
        },
      ],
    },
    {
      title: "Asistans",
      items: [
        {
          icon: "help-circle",
          label: "Sipò",
          onPress: () => Alert.alert("Sipò FlexaMarket", "Voye yon mesaj nan support@flexamarket.com oswa itilize seksyon Sipò sou sit entènèt la.", [{ text: "OK" }]),
        },
        {
          icon: "file-text",
          label: "Kondisyon Itilizasyon",
          onPress: () => Alert.alert("Kondisyon Itilizasyon", "Ale sou flexamarket.com/terms pou li kondisyon itilizasyon yo.", [{ text: "OK" }]),
        },
        {
          icon: "info",
          label: "Sou FlexaMarket",
          sublabel: "v1.0.0",
          onPress: () => Alert.alert("FLEXA MARKET", "Premye marketplace achte & vann ann Ayiti.\n\nVèsyon 1.0.0\n© 2026 FlexaMarket", [{ text: "OK" }]),
        },
      ],
    },
    {
      title: "",
      items: [
        {
          icon: "log-out",
          label: "Dekonekte",
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
          <Text style={[styles.title, { color: colors.foreground }]}>Paramèt</Text>
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
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { backgroundColor: "#22C55E22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: "#22C55E55" },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22C55E" },
});
