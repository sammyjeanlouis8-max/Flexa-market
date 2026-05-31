import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import React from "react";
import {
  Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const WEBSITE = "https://flexamarket.com";

interface PageItem {
  icon: string;
  label: string;
  path: string;
  color?: string;
}

const SECTIONS: Array<{ title: string; items: PageItem[] }> = [
  {
    title: "🏠 Akèy",
    items: [
      { icon: "home", label: "Akèy / Listings", path: "/" },
      { icon: "search", label: "Rechèch", path: "/search" },
      { icon: "video", label: "Vidéos Promo", path: "/videos" },
    ],
  },
  {
    title: "👤 Kont Mwen",
    items: [
      { icon: "user", label: "Profil", path: "/profile" },
      { icon: "package", label: "Mes Annonces", path: "/my-listings" },
      { icon: "heart", label: "Sauvegardés", path: "/favorites" },
      { icon: "tag", label: "Ofè", path: "/offers" },
      { icon: "shopping-bag", label: "Mes Kòmand", path: "/orders" },
    ],
  },
  {
    title: "📈 Vendè",
    items: [
      { icon: "trending-up", label: "Ventes / Sales", path: "/sales" },
      { icon: "zap", label: "Mes Boosts Actifs", path: "/boosts", color: "#F59E0B" },
      { icon: "video", label: "Mes Vidéos Promo", path: "/promo-videos" },
      { icon: "bar-chart-2", label: "Analytik", path: "/analytics" },
    ],
  },
  {
    title: "💰 Finans",
    items: [
      { icon: "credit-card", label: "Wallet", path: "/wallet" },
      { icon: "dollar-sign", label: "Demande Prêt", path: "/loans", color: "#6366F1" },
      { icon: "gift", label: "Kont Promo", path: "/promo-account" },
      { icon: "repeat", label: "Abonnman", path: "/subscription" },
    ],
  },
  {
    title: "🔒 Kont & Sekirite",
    items: [
      { icon: "shield", label: "KYC Verifikasyon", path: "/kyc" },
      { icon: "star", label: "Revize / Reviews", path: "/reviews" },
      { icon: "bell", label: "Notifikasyon", path: "/notifications" },
      { icon: "settings", label: "Paramèt", path: "/settings" },
    ],
  },
  {
    title: "🛡 Admin",
    items: [
      { icon: "grid", label: "Admin Dashboard", path: "/admin", color: "#6366F1" },
      { icon: "users", label: "Gere Itilizatè", path: "/admin/users", color: "#6366F1" },
      { icon: "list", label: "Jere Annons", path: "/admin/listings", color: "#6366F1" },
      { icon: "flag", label: "Rapò", path: "/admin/reports", color: "#6366F1" },
    ],
  },
];

async function openPage(path: string) {
  const url = `${WEBSITE}${path}`;
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    toolbarColor: "#F97316",
    controlsColor: "#FFFFFF",
    enableBarCollapsing: true,
  });
}

export default function WebsiteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>🌐 Site Wèb Konplè</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>flexamarket.com</Text>
        </View>
        <TouchableOpacity
          style={[styles.openAllBtn, { backgroundColor: colors.accent }]}
          onPress={() => openPage("/")}
        >
          <Feather name="external-link" size={14} color="#FFF" />
          <Text style={styles.openAllText}>Ouvri</Text>
        </TouchableOpacity>
      </View>

      {!user && (
        <View style={[styles.loginBanner, { backgroundColor: "#F59E0B22", borderColor: "#F59E0B44" }]}>
          <Feather name="alert-circle" size={16} color="#F59E0B" />
          <Text style={[styles.loginBannerText, { color: colors.foreground }]}>
            Ou dwe konekte sou sit wèb la apa pou jwenn tout fonksyon yo.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 80 }}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.path}
                  style={[
                    styles.row,
                    idx < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                  onPress={() => openPage(item.path)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.rowIcon, { backgroundColor: (item.color ?? colors.primary) + "18" }]}>
                    <Feather name={item.icon as any} size={17} color={item.color ?? colors.primary} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={[styles.infoBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="info" size={15} color={colors.mutedForeground} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Paj sit wèb yo ap ouvri nan yon navigatè entegre. Ou ka bezwen konekte apa sou sit wèb la.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  openAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  openAllText: { color: "#FFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  loginBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    margin: 16, marginBottom: 0, padding: 12, borderRadius: 12, borderWidth: 1,
  },
  loginBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", paddingLeft: 2 },
  sectionCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 13, paddingHorizontal: 14,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
