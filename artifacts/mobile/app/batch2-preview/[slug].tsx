/**
 * Dev visual preview for batch-2 authenticated screens (screenshot evidence).
 * Production routes remain /orders, /favorites, etc. — this is Expo-web safe UI.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getBatch2Page } from "@/lib/batch2Pages";

const HEADER = "#0B3D2E";
const DEMO_IMG =
  "https://res.cloudinary.com/dvkbgodbk/image/upload/v1780608173/flexa-market/tboq0rvkucjwiwof7gwh.jpg";

function Chrome({
  title,
  children,
  dark,
}: {
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.topBar, dark && styles.topBarDark]}>
        <Pressable
          style={[styles.iconBtn, dark && styles.iconBtnDark]}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Feather name="arrow-left" size={22} color={dark ? "#fff" : "#0F172A"} />
        </Pressable>
        <Text style={[styles.topTitle, dark && { color: "#fff" }]}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {children}
    </View>
  );
}

function OrdersPreview() {
  return (
    <Chrome title="My Orders">
      <View style={styles.chips}>
        {["All", "To ship", "In transit", "Delivered"].map((c, i) => (
          <View key={c} style={[styles.chip, i === 0 && styles.chipOn]}>
            <Text style={[styles.chipText, i === 0 && styles.chipTextOn]}>{c}</Text>
          </View>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        {[1, 2].map((n) => (
          <View key={n} style={styles.cardRow}>
            <Image source={{ uri: DEMO_IMG }} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.cardTitle}>Order #FM-100{n}</Text>
              <Text style={styles.muted}>Ventilateur Oscillant · $4.00</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {n === 1 ? "In transit" : "Delivered"}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </View>
        ))}
      </ScrollView>
    </Chrome>
  );
}

function OrderDetailPreview() {
  return (
    <Chrome title="Order details">
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.card}>
          <Text style={styles.label}>ORDER #FM-1001</Text>
          <Text style={styles.cardTitle}>Ventilateur Oscillant Rechargeable</Text>
          <Text style={styles.muted}>Paid with Stripe · $4.00 + ship $2.50</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>In transit</Text>
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>SHIPPING</Text>
          <Text style={styles.muted}>Test Buyer · Delmas 33, Port-au-Prince</Text>
          <Text style={styles.muted}>Motorcycle delivery</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>DELIVERY PIN</Text>
          <Text style={styles.pin}>4821</Text>
          <Text style={styles.muted}>Share with the driver on arrival (Haiti).</Text>
        </View>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Live tracking</Text>
        </Pressable>
      </ScrollView>
    </Chrome>
  );
}

function TrackingPreview() {
  const steps = [
    "Order received",
    "Driver assigned",
    "Picked up",
    "On the way",
    "Delivered",
  ];
  return (
    <Chrome title="Tracking" dark>
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={[styles.card, { backgroundColor: "#1E293B", borderColor: "#334155" }]}>
          <Text style={[styles.label, { color: "#94A3B8" }]}>STATUS</Text>
          <Text style={[styles.cardTitle, { color: "#fff" }]}>Sou wout · On the way</Text>
          <Text style={{ color: "#94A3B8" }}>Port-au-Prince → Delmas 33</Text>
        </View>
        {steps.map((s, i) => (
          <View key={s} style={styles.stepRow}>
            <View style={[styles.stepDot, i <= 3 && styles.stepDotOn]} />
            <Text style={[styles.stepText, i <= 3 && styles.stepTextOn]}>{s}</Text>
          </View>
        ))}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.label}>DRIVER</Text>
          <Text style={styles.cardTitle}>Jean D. · Motorcycle</Text>
          <Text style={styles.muted}>PIN at drop-off required</Text>
        </View>
      </ScrollView>
    </Chrome>
  );
}

function FavoritesPreview() {
  return (
    <Chrome title="Favorites">
      <View style={styles.grid}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={styles.favCard}>
            <Image source={{ uri: DEMO_IMG }} style={styles.favImg} contentFit="cover" />
            <Text style={styles.price}>${n === 2 ? "15" : "4"}</Text>
            <Text style={styles.favTitle} numberOfLines={2}>
              {n % 2 ? "Ventilateur Oscillant" : "Muscle Tank Tops"}
            </Text>
          </View>
        ))}
      </View>
    </Chrome>
  );
}

function AddressesPreview() {
  return (
    <Chrome title="Addresses">
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Home</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Default</Text>
            </View>
          </View>
          <Text style={styles.muted}>Test Buyer · 5095551234</Text>
          <Text style={styles.muted}>Delmas 33, Port-au-Prince, Haiti</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Work</Text>
          <Text style={styles.muted}>Test Buyer · 5095551234</Text>
          <Text style={styles.muted}>Pétion-Ville, Haiti</Text>
        </View>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Add address</Text>
        </Pressable>
      </ScrollView>
    </Chrome>
  );
}

function InboxPreview() {
  return (
    <Chrome title="Flexa Chat">
      <View style={styles.chips}>
        {["All", "Buying", "Selling"].map((c, i) => (
          <View key={c} style={[styles.chip, i === 0 && styles.chipOn]}>
            <Text style={[styles.chipText, i === 0 && styles.chipTextOn]}>{c}</Text>
          </View>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={styles.cardRow}>
            <View style={styles.avatar}>
              <Feather name="user" size={18} color="#64748B" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle}>Chelot goat</Text>
              <Text style={styles.muted} numberOfLines={1}>
                Eske fan an toujou disponible?
              </Text>
            </View>
            {n === 1 ? <View style={styles.unread} /> : null}
          </View>
        ))}
      </ScrollView>
    </Chrome>
  );
}

function NotificationsPreview() {
  return (
    <Chrome title="Notifications">
      <ScrollView contentContainerStyle={styles.pad}>
        {[
          "Order #FM-1001 is on the way",
          "New message from Chelot goat",
          "Price drop on a saved item",
        ].map((t, i) => (
          <View key={t} style={[styles.cardRow, i === 0 && styles.cardUnread]}>
            <View style={styles.avatar}>
              <Feather name="bell" size={16} color="#F97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t}</Text>
              <Text style={styles.muted}>Just now</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Chrome>
  );
}

export default function Batch2Preview() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const key = Array.isArray(slug) ? slug[0] : slug;
  const page = key ? getBatch2Page(key) : undefined;

  useEffect(() => {
    if (key && !page) router.replace("/(tabs)/profile");
  }, [key, page, router]);

  if (!page) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.muted}>Preview not available</Text>
      </View>
    );
  }

  switch (page.slug) {
    case "orders":
      return <OrdersPreview />;
    case "order-detail":
      return <OrderDetailPreview />;
    case "tracking":
      return <TrackingPreview />;
    case "favorites":
      return <FavoritesPreview />;
    case "addresses":
      return <AddressesPreview />;
    case "inbox":
      return <InboxPreview />;
    case "notifications":
      return <NotificationsPreview />;
    default:
      return (
        <Chrome title={page.title}>
          <Text style={[styles.muted, { padding: 20 }]}>
            Open real route {page.nativeRoute}
          </Text>
        </Chrome>
      );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F8FAFC",
  },
  topBarDark: { backgroundColor: HEADER },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  iconBtnDark: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "transparent" },
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#FFFFFF" },
  pad: { padding: 12, gap: 10, paddingBottom: 40 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  cardUnread: { borderColor: "#FED7AA", backgroundColor: "#FFF7ED" },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: "#E2E8F0" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.7,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  muted: { fontSize: 13, color: "#64748B" },
  badge: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#FFF7ED",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#C2410C" },
  pin: { fontSize: 28, fontWeight: "900", color: "#0F172A", letterSpacing: 4 },
  cta: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 10,
  },
  favCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 4,
  },
  favImg: { width: "100%", aspectRatio: 1, backgroundColor: "#E2E8F0" },
  price: { fontSize: 15, fontWeight: "800", color: "#0F172A", paddingHorizontal: 10, paddingTop: 8 },
  favTitle: { fontSize: 13, color: "#334155", paddingHorizontal: 10, paddingBottom: 10 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#CBD5E1" },
  stepDotOn: { backgroundColor: "#F97316" },
  stepText: { color: "#94A3B8", fontWeight: "600" },
  stepTextOn: { color: "#0F172A", fontWeight: "800" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  unread: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#F97316" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
});
