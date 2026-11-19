/**
 * Sponsored video player — autoplay with sound ON, 9:16 / 16:9 contain,
 * Sponsored badge, sound toggle, View Product, Message, Skip (after 10s).
 */
import { Feather } from "@expo/vector-icons";
import { Audio, ResizeMode, Video, AVPlaybackStatus } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
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
} from "@/lib/videosApi";

const SKIP_AFTER_SEC = 10;

export default function VideoWatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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
  }>();

  const listingId = Number(params.id || 0);
  const [videoUrl, setVideoUrl] = useState(
    () => resolveMediaUrl(params.videoUrl) || params.videoUrl || "",
  );
  const [title, setTitle] = useState(params.title || "Sponsored");
  const [sellerId, setSellerId] = useState<number | null>(
    params.sellerId ? Number(params.sellerId) : null,
  );
  const [isVideoOnly, setIsVideoOnly] = useState(params.isVideoOnly === "1");
  const [thumb, setThumb] = useState(params.thumb || "");
  const autoplay = params.autoplay !== "0";

  const videoRef = useRef<Video>(null);
  const [muted, setMuted] = useState(false);
  const [countdown, setCountdown] = useState(SKIP_AFTER_SEC);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const skipReady = countdown <= 0;
  const skipHandled = useRef(false);

  useEffect(() => {
    if (videoUrl || !listingId) return;
    let cancelled = false;
    const applyHit = (hit: {
      videoUrl?: string | null;
      title?: string | null;
      sellerId?: number | null;
      isVideoOnly?: boolean;
      thumbnail?: string | null;
    }) => {
      const uri = resolveMediaUrl(hit.videoUrl) || hit.videoUrl || "";
      if (!uri) return false;
      setVideoUrl(uri);
      setTitle(hit.title || "Sponsored");
      setSellerId(hit.sellerId ?? null);
      setIsVideoOnly(!!hit.isVideoOnly);
      setThumb(hit.thumbnail || "");
      return true;
    };
    void (async () => {
      // Auth feed can exclude promotions the viewer already saw / blocked sellers.
      // Fall back to guest public feed so deep-link / autoplay still resolves.
      const attempts: Array<{ token?: string | null; country?: string }> = [
        { token, country },
        { token: null, country },
        { token: null },
      ];
      for (const attempt of attempts) {
        if (cancelled) return;
        try {
          const data = await fetchVideosFeed(
            { country: attempt.country, page: 1, limit: 30, sort: "all" },
            { token: attempt.token },
          );
          const hit = data.videos.find((v) => v.id === listingId || v.listingId === listingId);
          if (hit && applyHit(hit)) return;
        } catch {
          /* try next */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoUrl, listingId, country, token]);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }, []);

  useEffect(() => {
    if (listingId) {
      void trackVideoImpression(listingId, { token });
      void trackBoosterEvent(listingId, "view", { token });
      void trackBoosterEvent(listingId, "video_view", { token });
    }
  }, [listingId, token]);

  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [autoplay]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void videoRef.current?.pauseAsync();
      }
    });
    return () => sub.remove();
  }, []);

  const stopAndClose = useCallback(async () => {
    if (skipHandled.current) return;
    skipHandled.current = true;
    try {
      await videoRef.current?.stopAsync();
    } catch {
      /* ignore */
    }
    if (router.canGoBack()) router.back();
    else router.replace("/videos");
  }, [router]);

  const onSkip = () => {
    if (!skipReady) return;
    if (listingId) void trackBoosterEvent(listingId, "skip", { token });
    void stopAndClose();
  };

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPosition(status.positionMillis / 1000);
    if (status.durationMillis) setDuration(status.durationMillis / 1000);
    if (status.didJustFinish) void stopAndClose();
  };

  const aspect = natural ? natural.w / natural.h : 9 / 16;
  const isLandscape = aspect > 1;
  const playerW = width;
  const playerH = isLandscape
    ? Math.min(width / aspect, height * 0.42)
    : Math.min(height * 0.72, width / aspect);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="promo-watch">
      <View style={styles.header}>
        <Pressable
          onPress={() => void stopAndClose()}
          style={styles.iconBtn}
          accessibilityLabel="Go back"
        >
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
              shouldPlay={autoplay}
              isLooping={false}
              isMuted={muted}
              volume={1}
              posterSource={thumb ? { uri: resolveMediaUrl(thumb) || thumb } : undefined}
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
          {title}
        </Text>

        {!isVideoOnly ? (
          <Pressable
            style={styles.viewProduct}
            onPress={() => {
              if (listingId) void trackBoosterEvent(listingId, "click", { token });
              void videoRef.current?.pauseAsync();
              router.push(`/listing/${listingId}` as any);
            }}
            testID="promo-view-product"
          >
            <Feather name="shopping-bag" size={14} color="#fff" />
            <Text style={styles.viewProductText}>View Product</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          style={styles.messageBtn}
          onPress={() => {
            void videoRef.current?.pauseAsync();
            if (sellerId) {
              router.push({
                pathname: "/chat/[id]",
                params: {
                  id: String(sellerId),
                  draft: isVideoOnly
                    ? `Hi — I saw your promotional video "${title}" on Flexa Market.`
                    : `Hi — I'm interested in "${title}" from your promo video.`,
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
