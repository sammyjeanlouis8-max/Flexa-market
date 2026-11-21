/**
 * Dev visual preview for batch-3 auth-gated screens (screenshot evidence).
 * Production routes remain /sell, /sales, /offers, etc.
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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getBatch3Page } from "@/lib/batch3Pages";

const DEMO_IMG =
  "https://res.cloudinary.com/dvkbgodbk/image/upload/v1780608173/flexa-market/tboq0rvkucjwiwof7gwh.jpg";

function Chrome({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {children}
    </View>
  );
}

function SellPreview() {
  return (
    <Chrome title="Sell">
      <ScrollView contentContainerStyle={styles.pad}>
        <Pressable style={styles.photoBox}>
          <Feather name="camera" size={28} color="#64748B" />
          <Text style={styles.muted}>Add photos (required)</Text>
        </Pressable>
        <Text style={styles.label}>TITLE</Text>
        <View style={styles.input}>
          <Text style={styles.placeholder}>What are you selling?</Text>
        </View>
        <Text style={styles.label}>PRICE</Text>
        <View style={styles.input}>
          <Text style={styles.placeholder}>0.00 USD</Text>
        </View>
        <Text style={styles.label}>CONDITION</Text>
        <View style={styles.chips}>
          {["New", "Like new", "Good", "Fair"].map((c, i) => (
            <View key={c} style={[styles.chip, i === 2 && styles.chipOn]}>
              <Text style={[styles.chipText, i === 2 && styles.chipTextOn]}>
                {c}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.label}>DESCRIPTION</Text>
        <View style={[styles.input, { minHeight: 88 }]}>
          <Text style={styles.placeholder}>Describe your item…</Text>
        </View>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Publish listing</Text>
        </Pressable>
      </ScrollView>
    </Chrome>
  );
}

function MyListingsPreview() {
  return (
    <Chrome title="My listings">
      <ScrollView contentContainerStyle={styles.pad}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={styles.cardRow}>
            <Image
              source={{ uri: DEMO_IMG }}
              style={styles.thumb}
              contentFit="cover"
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.cardTitle}>
                {n === 2 ? "Muscle Tank Tops" : "Ventilateur Oscillant"}
              </Text>
              <Text style={styles.muted}>
                ${n === 2 ? "15.00" : "4.00"} · Active
              </Text>
            </View>
            <Feather name="more-vertical" size={18} color="#94A3B8" />
          </View>
        ))}
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Create listing</Text>
        </Pressable>
      </ScrollView>
    </Chrome>
  );
}

function SalesPreview() {
  return (
    <Chrome title="Seller sales">
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.stats}>
          {[
            ["Earnings", "$128.50"],
            ["Orders", "12"],
            ["Pending", "2"],
            ["Done", "10"],
          ].map(([label, value]) => (
            <View key={label} style={styles.statCard}>
              <Text style={styles.muted}>{label}</Text>
              <Text style={styles.statValue}>{value}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.section}>Recent sales</Text>
        {[1, 2].map((n) => (
          <View key={n} style={styles.cardRow}>
            <Image
              source={{ uri: DEMO_IMG }}
              style={styles.thumb}
              contentFit="cover"
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.cardTitle}>Sale #S-40{n}</Text>
              <Text style={styles.muted}>Ventilateur · $4.00</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {n === 1 ? "To ship" : "Completed"}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </Chrome>
  );
}

function OffersPreview() {
  return (
    <Chrome title="Private offers">
      <View style={styles.chips}>
        {["Received", "Sent"].map((c, i) => (
          <View key={c} style={[styles.chip, i === 0 && styles.chipOn]}>
            <Text style={[styles.chipText, i === 0 && styles.chipTextOn]}>
              {c}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        {[1, 2].map((n) => (
          <View key={n} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Offer on Ventilateur</Text>
              <Text style={styles.price}>${n === 1 ? "3.50" : "3.00"}</Text>
            </View>
            <Text style={styles.muted}>
              From buyer · List price $4.00
            </Text>
            <View style={styles.rowGap}>
              <Pressable style={[styles.smallBtn, styles.smallBtnGhost]}>
                <Text style={styles.smallBtnGhostText}>Decline</Text>
              </Pressable>
              <Pressable style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>Accept</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </Chrome>
  );
}

function SupportPreview() {
  return (
    <Chrome title="Support">
      <ScrollView contentContainerStyle={styles.pad}>
        <Pressable style={styles.botCard}>
          <Feather name="message-circle" size={20} color="#F97316" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Ask FlexaBot</Text>
            <Text style={styles.muted}>Instant help for orders & delivery</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>
        {[
          ["Order delivery delay", "Open"],
          ["Wrong item received", "Waiting"],
          ["Account verification", "Closed"],
        ].map(([subj, status]) => (
          <View key={subj} style={styles.cardRow}>
            <View style={styles.avatar}>
              <Feather name="life-buoy" size={16} color="#64748B" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle}>{subj}</Text>
              <Text style={styles.muted}>{status}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </View>
        ))}
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>New ticket</Text>
        </Pressable>
      </ScrollView>
    </Chrome>
  );
}

function SupportDetailPreview() {
  return (
    <Chrome title="Ticket #1042">
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.card}>
          <Text style={styles.label}>SUBJECT</Text>
          <Text style={styles.cardTitle}>Order delivery delay</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Open</Text>
          </View>
        </View>
        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text style={styles.bubbleText}>
            My order #FM-1001 is still “In transit” after 2 days.
          </Text>
        </View>
        <View style={[styles.bubble, styles.bubbleAgent]}>
          <Text style={styles.bubbleText}>
            Thanks — we’re checking with the Haiti driver. You’ll get a PIN
            update shortly.
          </Text>
        </View>
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          editable={false}
          placeholder="Reply (text only — no voice)"
          placeholderTextColor="#94A3B8"
          style={styles.composerInput}
        />
        <Pressable style={styles.sendBtn}>
          <Feather name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </Chrome>
  );
}

function EditProfilePreview() {
  return (
    <Chrome title="Edit profile">
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.avatarBig}>
          <Feather name="user" size={36} color="#64748B" />
        </View>
        <Text style={[styles.muted, { textAlign: "center" }]}>
          Change photo
        </Text>
        <Text style={styles.label}>NAME</Text>
        <View style={styles.input}>
          <Text style={styles.inputText}>Test Buyer</Text>
        </View>
        <Text style={styles.label}>PHONE</Text>
        <View style={styles.input}>
          <Text style={styles.inputText}>5095551234</Text>
        </View>
        <Text style={styles.label}>LOCATION</Text>
        <View style={styles.input}>
          <Text style={styles.inputText}>Port-au-Prince, Haiti</Text>
        </View>
        <Text style={styles.label}>BIO</Text>
        <View style={[styles.input, { minHeight: 72 }]}>
          <Text style={styles.placeholder}>Tell buyers about you…</Text>
        </View>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Save changes</Text>
        </Pressable>
      </ScrollView>
    </Chrome>
  );
}

export default function Batch3Preview() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const key = Array.isArray(slug) ? slug[0] : slug;
  const page = key ? getBatch3Page(key) : undefined;

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
    case "sell":
      return <SellPreview />;
    case "my-listings":
      return <MyListingsPreview />;
    case "sales":
      return <SalesPreview />;
    case "offers":
      return <OffersPreview />;
    case "support":
      return <SupportPreview />;
    case "support-detail":
      return <SupportDetailPreview />;
    case "edit-profile":
      return <EditProfilePreview />;
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
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  pad: { padding: 12, gap: 10, paddingBottom: 40 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
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
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: "#E2E8F0" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBig: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.7,
    marginTop: 4,
  },
  section: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  muted: { fontSize: 13, color: "#64748B" },
  price: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  badge: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#FFF7ED",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#C2410C" },
  cta: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  inputText: { fontSize: 15, color: "#0F172A", fontWeight: "600" },
  placeholder: { fontSize: 15, color: "#94A3B8" },
  photoBox: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderStyle: "dashed",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  botCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF7ED",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FED7AA",
    padding: 14,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowGap: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  smallBtnGhost: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  smallBtnGhostText: { color: "#475569", fontWeight: "800", fontSize: 13 },
  bubble: {
    maxWidth: "88%",
    borderRadius: 16,
    padding: 12,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "#D1FAE5",
  },
  bubbleAgent: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bubbleText: { fontSize: 14, color: "#0F172A", lineHeight: 20 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  composerInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
});
