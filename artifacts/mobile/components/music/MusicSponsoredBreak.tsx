import { Feather } from "@expo/vector-icons";
import { Audio, AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  appendSponsoredAdHistory,
  fetchEligibleMusicAd,
  productPathForListing,
  resolveSponsoredVideoUrl,
  type MusicSponsoredAdListing,
} from "@/lib/musicAdBreak";
import {
  getPlayerState,
  setMusicAdBreakHandler,
  type MusicAdBreakRequest,
} from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type ActiveAd = {
  listing: MusicSponsoredAdListing;
  videoUrl: string;
  continueQueue: () => Promise<void>;
  intendsPlay: boolean;
};

export function MusicAdBreakHost() {
  const { token } = useAuth();
  const [active, setActive] = useState<ActiveAd | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [handoffMs, setHandoffMs] = useState(0);
  const resolveRef = useRef<(() => void) | null>(null);
  const impressionRef = useRef(false);
  const positionRef = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      const nowActive = s === "active";
      if (!nowActive && active) setHandoffMs(positionRef.current);
      setAppActive(nowActive);
    });
    return () => sub.remove();
  }, [active]);

  const completeAd = useCallback(
    async (ad: ActiveAd | null, playNext: boolean) => {
      setActive(null);
      impressionRef.current = false;
      positionRef.current = 0;
      setHandoffMs(0);
      try {
        if (ad && playNext && ad.intendsPlay) await ad.continueQueue();
      } finally {
        resolveRef.current?.();
        resolveRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    setMusicAdBreakHandler((req: MusicAdBreakRequest) => {
      impressionRef.current = false;
      return new Promise<void>((resolve) => {
        void (async () => {
          resolveRef.current = resolve;
          const listing = await fetchEligibleMusicAd(token);
          if (!listing?.boostVideoUrl) {
            if (req.intendsPlay) await req.continueQueue();
            resolve();
            resolveRef.current = null;
            return;
          }
          const videoUrl = resolveSponsoredVideoUrl(listing.boostVideoUrl);
          if (!videoUrl) {
            if (req.intendsPlay) await req.continueQueue();
            resolve();
            resolveRef.current = null;
            return;
          }
          setActive({
            listing,
            videoUrl,
            continueQueue: req.continueQueue,
            intendsPlay: req.intendsPlay,
          });
        })();
      });
    });
    return () => setMusicAdBreakHandler(null);
  }, [token]);

  if (!active) return null;

  const onPosition = (ms: number) => {
    positionRef.current = ms;
  };

  return appActive ? (
    <MusicSponsoredBreakForeground
      ad={active}
      handoffMs={handoffMs}
      onDone={(playNext) => void completeAd(active, playNext)}
      impressionRef={impressionRef}
      onPosition={onPosition}
    />
  ) : (
    <MusicSponsoredBreakBackgroundAudio
      ad={active}
      startAtMillis={handoffMs || positionRef.current}
      onDone={(playNext) => void completeAd(active, playNext)}
      impressionRef={impressionRef}
      onPosition={onPosition}
    />
  );
}

function recordImpressionOnce(
  impressionRef: React.MutableRefObject<boolean>,
  ad: ActiveAd,
  heardInBackground: boolean,
) {
  if (impressionRef.current) return;
  impressionRef.current = true;
  if (!heardInBackground) return;
  const thumb = resolveSponsoredVideoUrl(ad.listing.thumbnail);
  void appendSponsoredAdHistory({
    listingId: ad.listing.id,
    title: ad.listing.title,
    advertiser: ad.listing.sellerName,
    videoUrl: ad.videoUrl,
    thumbnail: thumb,
    productPath: productPathForListing(ad.listing),
    heardAt: new Date().toISOString(),
    heardInBackground,
  });
}

function MusicSponsoredBreakForeground({
  ad,
  handoffMs,
  onDone,
  impressionRef,
  onPosition,
}: {
  ad: ActiveAd;
  handoffMs: number;
  onDone: (playNext: boolean) => void;
  impressionRef: React.MutableRefObject<boolean>;
  onPosition: (ms: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const [position, setPosition] = useState(handoffMs);
  const [duration, setDuration] = useState(0);
  const player = getPlayerState();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (handoffMs > 0) void videoRef.current?.setPositionAsync(handoffMs);
  }, [handoffMs]);

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded || !mounted.current) return;
    const pos = status.positionMillis ?? 0;
    setPosition(pos);
    onPosition(pos);
    setDuration(status.durationMillis ?? 0);
    if (pos > 400) recordImpressionOnce(impressionRef, ad, false);
    if (status.didJustFinish) onDone(ad.intendsPlay);
  };

  const openProduct = () => {
    const path = productPathForListing(ad.listing);
    if (path) router.push(path as never);
    else if (ad.listing.boostExternalLink) void Linking.openURL(ad.listing.boostExternalLink);
  };

  const pct = duration > 0 ? Math.min(1, position / duration) : 0;
  const showCta = !!(productPathForListing(ad.listing) || ad.listing.boostExternalLink);

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]}>
      <View style={styles.brandRow}>
        <View style={styles.logoBars}>
          <View style={[styles.logoBar, { height: 8 }]} />
          <View style={[styles.logoBar, { height: 14 }]} />
          <View style={[styles.logoBar, { height: 10 }]} />
        </View>
        <Text style={styles.brand}>Flexa Music</Text>
      </View>
      <View style={styles.frame}>
        <View style={styles.videoWrap}>
          <Video
            ref={videoRef}
            source={{ uri: ad.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
            onPlaybackStatusUpdate={onStatus}
            useNativeControls={false}
          />
          <Text style={styles.badge}>Sponsored</Text>
          <View style={styles.controls}>
            <Feather name="pause" size={16} color="#fff" />
            <Text style={styles.time}>
              {formatTime(position)}
              {duration ? ` / ${formatTime(duration)}` : ""}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
            </View>
            <Feather name="volume-2" size={16} color="#fff" />
          </View>
        </View>
        <View style={styles.advertiserRow}>
          <View style={styles.advLogo}>
            <Text style={styles.advLogoText}>
              {(ad.listing.sellerName || "Ad").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.miniMeta}>
            <Text style={styles.advertiser} numberOfLines={1}>
              {ad.listing.sellerName || "Sponsored"}
            </Text>
            <Text style={styles.miniSub} numberOfLines={1}>
              {ad.listing.title}
            </Text>
          </View>
          {showCta ? (
            <Pressable style={styles.cta} onPress={openProduct} accessibilityRole="button">
              <Text style={styles.ctaText}>{ad.listing.boostCtaText || "View product"}</Text>
              <Feather name="external-link" size={14} color={musicTheme.charcoal} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={[styles.miniPaused, { marginBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={styles.miniCover} />
        <View style={styles.miniMeta}>
          <Text style={styles.miniSub}>Music paused</Text>
          <Text style={styles.miniTitle} numberOfLines={1}>
            {player.track?.title ?? "Flexa Music"}
          </Text>
        </View>
        <Feather name="more-vertical" size={18} color={musicTheme.muted} />
      </View>
    </View>
  );
}

function MusicSponsoredBreakBackgroundAudio({
  ad,
  startAtMillis,
  onDone,
  impressionRef,
  onPosition,
}: {
  ad: ActiveAd;
  startAtMillis: number;
  onDone: (playNext: boolean) => void;
  impressionRef: React.MutableRefObject<boolean>;
  onPosition: (ms: number) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    let sound: Audio.Sound | null = null;
    void (async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const created = await Audio.Sound.createAsync(
        { uri: ad.videoUrl },
        {
          shouldPlay: true,
          positionMillis: Math.max(0, startAtMillis),
          progressUpdateIntervalMillis: 400,
        },
      );
      if (cancelled) {
        await created.sound.unloadAsync();
        return;
      }
      sound = created.sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        const pos = status.positionMillis ?? 0;
        onPosition(pos);
        if (pos > 400) recordImpressionOnce(impressionRef, ad, true);
        if (status.didJustFinish) onDone(ad.intendsPlay);
      });
    })();
    return () => {
      cancelled = true;
      void sound?.unloadAsync();
    };
  }, [ad, startAtMillis, impressionRef, onDone, onPosition]);

  return null;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: "#0A0A0A",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  logoBars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 16 },
  logoBar: { width: 3, borderRadius: 1, backgroundColor: musicTheme.orange },
  brand: { color: musicTheme.white, fontWeight: "900", fontSize: 16 },
  frame: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  videoWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: musicTheme.orange,
    color: musicTheme.charcoal,
    fontWeight: "800",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  advertiserRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  advLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: musicTheme.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  advLogoText: { color: musicTheme.orange, fontWeight: "900" },
  advertiser: { color: musicTheme.white, fontWeight: "800", fontSize: 14 },
  video: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000",
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 4, backgroundColor: "#fff" },
  time: { color: "#fff", fontSize: 11, fontWeight: "600" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: musicTheme.orange,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  ctaText: { color: musicTheme.charcoal, fontWeight: "800", fontSize: 13 },
  miniPaused: {
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: musicTheme.forest,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: musicTheme.line,
  },
  miniCover: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#1A1A1A",
  },
  miniMeta: { flex: 1, minWidth: 0 },
  miniTitle: { color: musicTheme.white, fontWeight: "800", fontSize: 14 },
  miniSub: { color: musicTheme.muted, fontSize: 11, marginTop: 2 },
});