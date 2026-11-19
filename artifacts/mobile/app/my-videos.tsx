/**
 * My Videos — Active / Under Review / Rejected / Expired
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import {
  campaignTab,
  cancelBoosterCampaign,
  fetchBoosterCampaigns,
  type BoosterCampaign,
  type MyVideosTab,
} from "@/lib/boostApi";
import { formatDuration } from "@/lib/videosApi";
import { resolveMediaUrl } from "@/lib/mediaUrl";

const TABS: { id: MyVideosTab; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "under_review", label: "Under Review" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Expired" },
];

const STATUS_LABEL: Record<MyVideosTab, string> = {
  active: "Active",
  under_review: "Under Review",
  rejected: "Rejected",
  expired: "Expired",
};

export default function MyVideosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<MyVideosTab>("active");
  const [rows, setRows] = useState<BoosterCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchBoosterCampaigns({ token });
      setRows(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load videos");
      setRows((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      void load();
    }, [authLoading, token, load, router]),
  );

  const filtered = useMemo(() => {
    const list = rows ?? [];
    return list.filter((c) => {
      const t = campaignTab(c.status, c.endsAt);
      if (t === "draft") return false;
      return t === tab;
    });
  }, [rows, tab]);

  const openMenu = (item: BoosterCampaign) => {
    const actions: { label: string; onPress: () => void; destructive?: boolean }[] = [
      {
        label: "Open video",
        onPress: () =>
          router.push({
            pathname: "/videos/watch",
            params: {
              id: String(item.listingId),
              videoUrl: item.boostVideoUrl || "",
              title: item.title,
              thumb: item.thumbnail || "",
              autoplay: "0",
            },
          } as any),
      },
      {
        label: "View analytics",
        onPress: () => router.push("/boost-analytics" as any),
      },
      {
        label: "Drafts",
        onPress: () => router.push("/my-drafts" as any),
      },
    ];
    if (tab === "expired" || item.canRenew) {
      actions.unshift({
        label: "Renew Boost",
        onPress: () =>
          router.push({
            pathname: "/boost-video",
            params: {
              renewBoostId: String(item.boostId),
              listingId: String(item.listingId),
              videoUrl: item.boostVideoUrl || "",
              title: item.title,
              plan: item.plan || "",
              budget: String(item.budget || ""),
            },
          } as any),
      });
    }
    if (tab === "active") {
      actions.push({
        label: "Cancel campaign",
        destructive: true,
        onPress: () => {
          Alert.alert("Cancel campaign?", "This stops delivery for this boost.", [
            { text: "Keep", style: "cancel" },
            {
              text: "Cancel",
              style: "destructive",
              onPress: () => {
                if (!token) return;
                void cancelBoosterCampaign(item.boostId, { token })
                  .then(() => load())
                  .catch((e) =>
                    Alert.alert("Cancel failed", e instanceof Error ? e.message : "Try again"),
                  );
              },
            },
          ]);
        },
      });
    }

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...actions.map((a) => a.label), "Close"],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        },
        (idx) => {
          if (idx < actions.length) actions[idx].onPress();
        },
      );
    } else {
      Alert.alert(
        item.title,
        undefined,
        [
          ...actions.map((a) => ({
            text: a.label,
            style: a.destructive ? ("destructive" as const) : ("default" as const),
            onPress: a.onPress,
          })),
          { text: "Close", style: "cancel" },
        ],
      );
    }
  };

  const renderItem = ({ item }: { item: BoosterCampaign }) => {
    const thumb = resolveMediaUrl(item.thumbnail) || item.thumbnail;
    const dur = formatDuration(item.durationSec);
    const showRenew = tab === "expired" || !!item.canRenew;
    return (
      <View style={styles.card} testID={`my-video-${item.boostId}`}>
        <Pressable
          style={styles.cardMain}
          onPress={() => openMenu(item)}
          accessibilityLabel={item.title}
        >
          <View style={styles.thumbWrap}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Feather name="film" size={20} color="#94A3B8" />
              </View>
            )}
            <View style={styles.playOverlay}>
              <Feather name="play" size={14} color="#fff" />
            </View>
            {!!dur && (
              <View style={styles.durBadge}>
                <Text style={styles.durText}>{dur}</Text>
              </View>
            )}
          </View>
          <View style={styles.meta}>
            <View style={styles.metaTop}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Pressable
                onPress={() => openMenu(item)}
                hitSlop={12}
                style={styles.moreBtn}
                testID={`my-video-menu-${item.boostId}`}
              >
                <Feather name="more-vertical" size={18} color="#64748B" />
              </Pressable>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{STATUS_LABEL[tab]}</Text>
            </View>
            {showRenew ? (
              <Pressable
                style={styles.renewBtn}
                onPress={() =>
                  router.push({
                    pathname: "/boost-video",
                    params: {
                      renewBoostId: String(item.boostId),
                      listingId: String(item.listingId),
                      videoUrl: item.boostVideoUrl || "",
                      title: item.title,
                      plan: item.plan || "",
                      budget: String(item.budget || ""),
                    },
                  } as any)
                }
                testID={`renew-boost-${item.boostId}`}
              >
                <Text style={styles.renewText}>Renew Boost</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/videos"))}
          style={styles.iconBtn}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={styles.brandRow}>
          <Feather name="shopping-bag" size={16} color="#FFFFFF" />
          <Text style={styles.brand}>Flexa Market</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>My Videos</Text>
        <View style={styles.tabRow}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                hitSlop={8}
                style={[styles.tab, active && styles.tabActive]}
                testID={`my-videos-tab-${t.id}`}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {rows === null && !error ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.flexaGreen} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.boostId)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
                tintColor={colors.flexaGreen}
              />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {error || `No ${STATUS_LABEL[tab].toLowerCase()} campaigns.`}
              </Text>
            }
            ListFooterComponent={
              <Pressable style={styles.draftsLink} onPress={() => router.push("/my-drafts" as any)}>
                <Text style={styles.draftsText}>Open saved drafts</Text>
                <Feather name="chevron-right" size={16} color={colors.flexaGreen} />
              </Pressable>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.flexaGreen },
  header: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brand: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  body: { flex: 1, backgroundColor: "#FFFFFF" },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  tabRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.flexaGreen,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: colors.flexaGreen,
    borderColor: colors.flexaGreen,
  },
  tabText: { fontSize: 10, fontWeight: "700", color: colors.flexaGreen, textAlign: "center" },
  tabTextActive: { color: "#FFFFFF", fontWeight: "800" },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    marginBottom: 12,
    overflow: "hidden",
  },
  cardMain: { flexDirection: "row", padding: 12, gap: 12 },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  thumb: { width: "100%", height: "100%" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  durBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  meta: { flex: 1, minWidth: 0 },
  metaTop: { flexDirection: "row", alignItems: "flex-start" },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0F172A" },
  moreBtn: { padding: 4 },
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: { fontSize: 10, fontWeight: "700", color: "#64748B" },
  renewBtn: {
    marginTop: 10,
    backgroundColor: colors.flexaGreen,
    borderRadius: 10,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  renewText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: "#64748B", marginTop: 40, fontSize: 13 },
  draftsLink: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
  },
  draftsText: { color: colors.flexaGreen, fontWeight: "700", fontSize: 13 },
});
