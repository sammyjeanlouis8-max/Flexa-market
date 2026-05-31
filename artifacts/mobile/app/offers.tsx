import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface Offer {
  id: number;
  amount: number;
  status: string;
  message?: string;
  createdAt: string;
  buyerId: number;
  sellerId: number;
  listing?: { id: number; title: string; price: number; images?: string[] };
  buyer?: { id: number; name: string };
  seller?: { id: number; name: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  accepted: "#22C55E",
  rejected: "#EF4444",
  countered: "#6366F1",
  cancelled: "#94A3B8",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "kounye a";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

export default function OffersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { request } = useApi();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOffers = useCallback(async () => {
    try {
      const data = await request<{ offers?: Offer[] } | Offer[]>("/offers");
      const list = Array.isArray(data) ? data : (data as any).offers ?? [];
      setOffers(list);
    } catch { setOffers([]); }
  }, [request]);

  useEffect(() => { fetchOffers().finally(() => setLoading(false)); }, [fetchOffers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOffers();
    setRefreshing(false);
  }, [fetchOffers]);

  async function handleAccept(id: number) {
    try {
      await request(`/offers/${id}/accept`, { method: "POST" });
      setOffers((prev) => prev.map((o) => o.id === id ? { ...o, status: "accepted" } : o));
    } catch (e: any) { Alert.alert("Erè", e?.message ?? "Erè"); }
  }

  async function handleReject(id: number) {
    Alert.alert("Rejte Ofè?", "Ou sèten ou vle rejte ofè sa a?", [
      { text: "Anile", style: "cancel" },
      { text: "Rejte", style: "destructive", onPress: async () => {
        try {
          await request(`/offers/${id}/reject`, { method: "POST" });
          setOffers((prev) => prev.map((o) => o.id === id ? { ...o, status: "rejected" } : o));
        } catch (e: any) { Alert.alert("Erè", e?.message ?? "Erè"); }
      }},
    ]);
  }

  const received = offers.filter((o) => o.sellerId === user?.id);
  const sent = offers.filter((o) => o.buyerId === user?.id);
  const displayed = tab === "received" ? received : sent;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ofè</Text>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {(["received", "sent"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "received" ? `Resevwa (${received.length})` : `Voye (${sent.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {displayed.length === 0 ? (
        <View style={styles.center}>
          <Feather name="tag" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Okenn ofè</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {tab === "received" ? "Ou pako resevwa okenn ofè" : "Ou pako voye okenn ofè"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const isReceived = item.sellerId === user?.id;
            const statusColor = STATUS_COLORS[item.status] ?? "#94A3B8";
            const img = item.listing?.images?.[0];
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => item.listing?.id && router.push(`/listing/${item.listing.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.cardImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.cardImg, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="image" size={20} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={styles.cardMeta}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {item.listing?.title ?? "Annons"}
                    </Text>
                    <Text style={[styles.cardPriceOrig, { color: colors.mutedForeground }]}>
                      Pri: ${Number(item.listing?.price ?? 0).toFixed(2)}
                    </Text>
                    <Text style={[styles.cardOffer, { color: colors.accent }]}>
                      Ofè: ${Number(item.amount).toFixed(2)}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
                      </View>
                      <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
                    </View>
                  </View>
                </View>
                {item.message ? (
                  <Text style={[styles.msg, { color: colors.mutedForeground, borderTopColor: colors.border }]} numberOfLines={2}>
                    "{item.message}"
                  </Text>
                ) : null}
                {isReceived && item.status === "pending" && (
                  <View style={[styles.actions, { borderTopColor: colors.border }]}>
                    <Pressable style={[styles.actionBtn, { backgroundColor: "#22C55E22" }]} onPress={() => handleAccept(item.id)}>
                      <Feather name="check" size={16} color="#22C55E" />
                      <Text style={[styles.actionText, { color: "#22C55E" }]}>Aksepte</Text>
                    </Pressable>
                    <Pressable style={[styles.actionBtn, { backgroundColor: "#EF444422" }]} onPress={() => handleReject(item.id)}>
                      <Feather name="x" size={16} color="#EF4444" />
                      <Text style={[styles.actionText, { color: "#EF4444" }]}>Rejte</Text>
                    </Pressable>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", padding: 12, gap: 12 },
  cardImg: { width: 72, height: 72, borderRadius: 10 },
  cardMeta: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  cardPriceOrig: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardOffer: { fontSize: 15, fontFamily: "Inter_700Bold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  msg: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic", borderTopWidth: 1 },
  actions: { flexDirection: "row", borderTopWidth: 1, gap: 1 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  actionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
