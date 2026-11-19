/**
 * Sponsored video feed pager — opens on the selected listing id, then lets the
 * user scroll through remaining eligible promos (WebView VideoFeed parity).
 * Home strip passes autoplay=1 after tap; cards themselves never autoplay.
 */
import { Feather } from "@expo/vector-icons";
import { Audio, ResizeMode, Video, AVPlaybackStatus } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  fetchVideosFeed,
  formatDuration,
  trackBoosterEvent,
  trackVideoImpression,
  type PromoVideo,
} from "@/lib/videosApi";

const SKIP_AFTER_SEC = 10;

type WatchItem = PromoVideo & { key: string };

function VideoPage({
  item,
  active,
  autoplay,
  height,
  width,
  insetsTop,
  insetsBottom,
  onClose,
}: {
  item: WatchItem;
  active: boolean;
  autoplay: boolean;
  height: number;
  width: number;
  insetsTop: number;
  insetsBottom: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { token } = useAuth();
  const videoRef = useRef<Video>(null);
  const [muted, setMuted] = useState(false);
  const [countdown, setCountdown] = useState(SKIP_AFTER_SEC);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const skipReady = countdown <= 0;
  const listingId = item.listingId || item.id;
  const videoUrl = resolveMediaUrl(item.videoUrl) || item.videoUrl || "";
  const thumb = resolveMediaUrl(item.thumbnail || item.thumbnailUrl) || item.thumbnail || "";

  useEffect(() => {
    if (!active || !listingId) return;
    void trackVideoImpression(listingId, { token });
    void trackBoosterEvent(listingId, "view", { token });
    void trackBoosterEvent(listingId, "video_view", { token });
  }, [active, listingId, token]);

  useEffect(() => {
    if (!active || !autoplay) return;
    setCountdown(SKIP_AFTER_SEC);
    const id = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [active, autoplay, listingId]);

  useEffect(() => {
    if (!active) {
      void videoRef.current?.pauseAsync().catch(() => {});
      return;
    }
    if (autoplay) {
      void videoRef.current?.playAsync().catch(() => {});
    } else {
      void videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [active, autoplay, videoUrl]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void videoRef.current?.pauseAsync().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const onSkip = () => {
    if (!skipReady) return;
    if (listingId) void trackBoosterEvent(listingId, "skip", { token });
    onClose();
  };

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPosition(status.positionMillis / 1000);
    if (status.durationMillis) setDuration(status.durationMillis / 1000);
    if (status.didJustFinish && active) onClose();
  };

  const aspect = natural ? natural.w / natural.h : 9 / 16;
  const isLandscape = aspect > 1;
  const playerW = width;
  const playerH = isLandscape
    ? Math.min(width / aspect, height * 0.42)
    : Math.min(height * 0.72, width / aspect);

  return (
    <View style={[styles.page, { height, paddingTop: insetsTop }]} testID={`promo-watch-page-${listingId}`}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/")}>
          <Feather name="home" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.stage}>
        <View style={[styles.playerFrame, { width: playerW, height: playerH }]}>
          {videoUrl ? (
            <Video
              ref={videoRef}
              style={StyleSheet.absoluteFill}
              source={{ uri: videoUrl }}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={active && autoplay}
              isLooping={false}
              isMuted={muted}
              volume={1}
              posterSource={thumb ? { uri: thumb } : undefined}
              usePoster={!!thumb}
              onReadyForDisplay={(e) => {
                const s = e.naturalSize;
                if (s?.width && s?.height) setNatural({ w: s.width, h: s.height });
              }}
              onPlaybackStatusUpdate={onStatus}
            />
          ) : (
            <View style={styles.missing}>
              <Text style={styles.missingText}>Video unavailable</Text>
            </View>
          )}
          <View style={styles.sponsored}>
            <Text style={styles.sponsoredText}>Sponsored</Text>
          </View>
          <Pressable
            style={styles.soundBtn}
            onPress={() => setMuted((m) => !m)}
            testID="promo-sound-toggle"
          >
            <Feather name={muted ? "volume-x" : "volume-2"} size={14} color="#fff" />
            <Text style={styles.soundText}>{muted ? "Sound off" : "Sound on"}</Text>
          </Pressable>
          {duration > 0 && (
            <View style={styles.progressRow}>
              <Text style={styles.timeText}>
                {formatDuration(position)} / {formatDuration(duration)}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, (position / duration) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {item.title || "Sponsored"}
        </Text>

        {!item.isVideoOnly ? (
          <Pressable
            style={styles.viewProduct}
            onPress={() => {
              if (listingId) void trackBoosterEvent(listingId, "click", { token });
              void videoRef.current?.pauseAsync().catch(() => {});
              router.push(`/listing/${listingId}` as any);
            }}
            testID="promo-view-product"
          >
            <Feather name="shopping-bag" size={14} color="#fff" />
            <Text style={styles.viewProductText}>View Product</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insetsBottom, 12) }]}>
        <Pressable
          style={styles.messageBtn}
          onPress={() => {
            void videoRef.current?.pauseAsync().catch(() => {});
            if (item.sellerId) {
              router.push({
                pathname: "/chat/[id]",
                params: {
                  id: String(item.sellerId),
                  draft: item.isVideoOnly
                    ? `Hi — I saw your promotional video "${item.title || ""}" on Flexa Market.`
                    : `Hi — I'm interested in "${item.title || ""}" from your promo video.`,
                },
              } as any);
            } else {
              router.push("/(tabs)/inbox" as any);
            }
          }}
          testID="promo-message"
        >
          <Feather name="message-circle" size={16} color="#fff" />
          <Text style={styles.messageText}>Message</Text>
        </Pressable>
        <Pressable
          style={[styles.skipBtn, !skipReady && styles.skipDisabled]}
          onPress={onSkip}
          disabled={!skipReady}
          testID="promo-skip"
        >
          <Text style={styles.skipText}>
            {skipReady ? "Skip" : `Skip in ${countdown}s`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function VideoWatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const params = useLocalSearchParams<{
    id?: string;
    videoUrl?: string;
    title?: string;
    thumb?: string;
    sellerId?: string;
    isVideoOnly?: string;
    autoplay?: string;
    fromHome?: string;
  }>();

  const selectedId = Number(params.id || 0);
  const autoplay = params.autoplay !== "0";
  const [items, setItems] = useState<WatchItem[]>([]);
  const [activeId, setActiveId] = useState(selectedId || 0);
  const [loading, setLoading] = useState(true);
  const [initialIndex, setInitialIndex] = useState(0);
  const listRef = useRef<FlatList<WatchItem>>(null);

  const seedItem = useMemo<WatchItem | null>(() => {
    if (!selectedId && !params.videoUrl) return null;
    return {
      key: `seed-${selectedId || "x"}`,
      id: selectedId || 0,
      listingId: selectedId || 0,
      title: params.title || "Sponsored",
      videoUrl: params.videoUrl || "",
      thumbnail: params.thumb || "",
      thumbnailUrl: params.thumb || "",
      sellerId: params.sellerId ? Number(params.sellerId) : null,
      isVideoOnly: params.isVideoOnly === "1",
    };
  }, [params.isVideoOnly, params.sellerId, params.thumb, params.title, params.videoUrl, selectedId]);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const attempts: Array<{ token?: string | null; country?: string; sort: string }> = [
        { token, country, sort: "new" },
        { token: null, country, sort: "new" },
        { token: null, sort: "new" },
        { token, country, sort: "all" },
        { token: null, sort: "all" },
      ];
      let feed: PromoVideo[] = [];
      for (const attempt of attempts) {
        if (cancelled) return;
        try {
          const data = await fetchVideosFeed(
            {
              country: attempt.country,
              page: 1,
              limit: 40,
              sort: attempt.sort,
            },
            { token: attempt.token },
          );
          if (data.videos?.length) {
            feed = data.videos;
            break;
          }
        } catch {
          /* try next */
        }
      }
      if (cancelled) return;

      const mapped: WatchItem[] = feed.map((v) => ({
        ...v,
        key: `v-${v.listingId || v.id}`,
      }));

      // Ensure the tapped card is present and first among equals for deep-link open.
      if (seedItem && seedItem.id) {
        const idx = mapped.findIndex(
          (v) => v.id === seedItem.id || v.listingId === seedItem.id,
        );
        if (idx >= 0) {
          if (seedItem.videoUrl) {
            mapped[idx] = {
              ...mapped[idx],
              videoUrl: seedItem.videoUrl || mapped[idx].videoUrl,
              title: seedItem.title || mapped[idx].title,
              thumbnail: seedItem.thumbnail || mapped[idx].thumbnail,
            };
          }
        } else {
          mapped.unshift(seedItem);
        }
      } else if (mapped.length === 0 && seedItem) {
        mapped.push(seedItem);
      }

      const start = Math.max(
        0,
        mapped.findIndex((v) => v.id === selectedId || v.listingId === selectedId),
      );
      setItems(mapped);
      setInitialIndex(start >= 0 ? start : 0);
      setActiveId(
        mapped[start >= 0 ? start : 0]?.listingId ||
          mapped[start >= 0 ? start : 0]?.id ||
          selectedId,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [country, seedItem, selectedId, token]);

  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(params.fromHome === "1" ? "/" : "/videos");
  }, [params.fromHome, router]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems.find((v) => v.isViewable)?.item as WatchItem | undefined;
      if (!first) return;
      setActiveId(first.listingId || first.id);
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  if (loading && items.length === 0) {
    return (
      <View style={[styles.root, styles.loading]} testID="promo-watch">
        <ActivityIndicator color="#FFFFFF" size="large" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.root, styles.loading]} testID="promo-watch">
        <Text style={styles.missingText}>Video unavailable</Text>
        <Pressable onPress={onClose} style={{ marginTop: 16 }}>
          <Text style={styles.soundText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="promo-watch">
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.key}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 50);
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <VideoPage
            item={item}
            active={activeId === (item.listingId || item.id)}
            autoplay={autoplay}
            height={height}
            width={width}
            insetsTop={insets.top}
            insetsBottom={insets.bottom}
            onClose={onClose}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.flexaGreen },
  loading: { alignItems: "center", justifyContent: "center" },
  page: { backgroundColor: colors.flexaGreen },
  header: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { color: "#fff", fontSize: 14, fontWeight: "700" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  playerFrame: {
    backgroundColor: "#0B3D2A",
    borderRadius: 4,
    overflow: "hidden",
    maxWidth: "100%",
  },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: "#fff", fontSize: 13 },
  sponsored: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(20,108,67,0.9)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sponsoredText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  soundBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  soundText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  progressRow: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 8,
  },
  timeText: { color: "#fff", fontSize: 10, fontWeight: "600", marginBottom: 4 },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff" },
  title: {
    marginTop: 14,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  viewProduct: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  viewProductText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  messageBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  messageText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  skipBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipDisabled: { opacity: 0.55 },
  skipText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
