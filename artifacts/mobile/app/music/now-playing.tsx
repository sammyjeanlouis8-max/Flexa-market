import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TrackListRow } from "@/components/music/TrackRow";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { absoluteMusicUrl, fetchTrackLikes, toggleTrackLike } from "@/lib/musicApi";
import {
  getPlayerState,
  next,
  previous,
  seek,
  setRepeat,
  setShuffle,
  subscribeMusicPlayer,
  togglePlayPause,
  type PlayerState,
} from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

const LIKED_KEY = "flexa_music_liked_ids";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useLanguage();
  const [state, setState] = useState<PlayerState>(getPlayerState());
  const [liked, setLiked] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const scrubWidth = useRef(1);

  useEffect(() => subscribeMusicPlayer(setState), []);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (state.isPlaying && !state.adBreakActive) {
      loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 12000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
    } else {
      spin.stopAnimation();
    }
    return () => {
      loop?.stop();
    };
  }, [state.isPlaying, state.adBreakActive, spin]);

  useEffect(() => {
    const id = state.track?.id;
    if (!id) return;
    void fetchTrackLikes(id, { token }).then((lk) => setLiked(lk.liked)).catch(() => {});
  }, [state.track?.id, token]);

  const track = state.track;
  const cover = track ? absoluteMusicUrl(track.cover_url) : null;
  const progress =
    state.durationMillis > 0 ? state.positionMillis / state.durationMillis : 0;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const cycleRepeat = () => {
    const order: PlayerState["repeat"][] = ["off", "all", "one"];
    const i = order.indexOf(state.repeat);
    setRepeat(order[(i + 1) % order.length]);
  };

  const onFavorite = async () => {
    if (!track) return;
    if (!token) {
      router.push("/auth/login");
      return;
    }
    try {
      const res = await toggleTrackLike(track.id, { token });
      setLiked(res.liked);
      const raw = await AsyncStorage.getItem(LIKED_KEY);
      const ids: number[] = raw ? JSON.parse(raw) : [];
      const nextIds = res.liked
        ? [track.id, ...ids.filter((x) => x !== track.id)]
        : ids.filter((x) => x !== track.id);
      await AsyncStorage.setItem(LIKED_KEY, JSON.stringify(nextIds));
    } catch {
      /* */
    }
  };

  const onShare = async () => {
    if (!track) return;
    try {
      await Share.share({
        message: `${track.title} — ${track.artist}\nhttps://flexamarket.com/music`,
      });
    } catch {
      /* */
    }
  };

  if (!track) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-down" size={28} color={musicTheme.text} />
        </Pressable>
        <Text style={styles.empty}>{t("music_nothingPlaying")}</Text>
        <Pressable style={styles.cta} onPress={() => router.replace("/(tabs)/music")}>
          <Text style={styles.ctaText}>{t("music_browse")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="music-now-playing">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t("music_collapse")}>
          <Feather name="chevron-down" size={28} color={musicTheme.text} />
        </Pressable>
        <Text style={styles.now}>{t("music_nowPlaying")}</Text>
        <Pressable onPress={() => void onShare()} hitSlop={12} accessibilityLabel={t("music_share")}>
          <Feather name="share-2" size={20} color={musicTheme.text} />
        </Pressable>
      </View>

      <View style={styles.vinylWrap}>
        <Animated.View style={[styles.vinylRing, { transform: [{ rotate }] }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.vinylArt} contentFit="cover" />
          ) : (
            <View style={[styles.vinylArt, styles.vinylFb]}>
              <Feather name="disc" size={64} color={musicTheme.orange} />
            </View>
          )}
        </Animated.View>
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <Pressable onPress={() => void onFavorite()} hitSlop={10} accessibilityLabel={t("music_favorite")}>
          <Feather name="heart" size={24} color={liked ? musicTheme.orange : musicTheme.muted} />
        </Pressable>
      </View>

      <View
        style={styles.scrubber}
        onLayout={(e) => {
          scrubWidth.current = e.nativeEvent.layout.width || 1;
        }}
      >
        <Pressable
          onPress={(e) => {
            const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / scrubWidth.current));
            void seek(ratio * state.durationMillis);
          }}
        >
          <View style={styles.scrubTrack}>
            <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
          </View>
        </Pressable>
        <View style={styles.scrubLabels}>
          <Text style={styles.time}>{fmt(state.positionMillis)}</Text>
          <Text style={styles.time}>
            -{fmt(Math.max(0, state.durationMillis - state.positionMillis))}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => setShuffle(!state.shuffle)} accessibilityLabel={t("music_shuffle")}>
          <Feather
            name="shuffle"
            size={22}
            color={state.shuffle ? musicTheme.orange : musicTheme.muted}
          />
        </Pressable>
        <Pressable onPress={() => void previous()}>
          <Feather name="skip-back" size={30} color={musicTheme.text} />
        </Pressable>
        <Pressable style={styles.bigPlay} onPress={() => void togglePlayPause()}>
          <Feather
            name={state.isPlaying ? "pause" : "play"}
            size={32}
            color={musicTheme.white}
          />
        </Pressable>
        <Pressable onPress={() => void next()}>
          <Feather name="skip-forward" size={30} color={musicTheme.text} />
        </Pressable>
        <Pressable onPress={cycleRepeat} accessibilityLabel={t("music_repeat")}>
          <Feather
            name="repeat"
            size={22}
            color={state.repeat !== "off" ? musicTheme.orange : musicTheme.muted}
          />
        </Pressable>
      </View>

      <Text style={styles.upNext}>{t("music_queue")}</Text>
      <ScrollView
        style={styles.queue}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {state.queue.map((tr, i) => (
          <TrackListRow
            key={`${tr.id}-${i}`}
            track={tr}
            right={
              i === state.index ? (
                <Feather name="volume-2" size={18} color={musicTheme.orange} />
              ) : undefined
            }
            onPress={async () => {
              const { setQueue: sq } = await import("@/lib/musicPlayer");
              await sq(state.queue, i);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: musicTheme.bg, paddingHorizontal: 20 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  now: { color: musicTheme.muted, fontWeight: "700" },
  vinylWrap: { alignItems: "center", marginVertical: 20 },
  vinylRing: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 10,
    borderColor: musicTheme.forest,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: musicTheme.card,
  },
  vinylArt: { width: 200, height: 200, borderRadius: 100 },
  vinylFb: { alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { color: musicTheme.text, fontSize: 22, fontWeight: "800" },
  artist: { color: musicTheme.muted, marginTop: 4 },
  scrubber: { marginBottom: 8 },
  scrubTrack: { height: 4, backgroundColor: musicTheme.border, borderRadius: 2, overflow: "hidden" },
  scrubFill: { height: 4, backgroundColor: musicTheme.orange },
  scrubLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  time: { color: musicTheme.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginVertical: 16,
  },
  bigPlay: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: musicTheme.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  upNext: {
    color: musicTheme.emerald,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  queue: { flex: 1 },
  empty: { color: musicTheme.muted, marginTop: 40, textAlign: "center" },
  cta: {
    marginTop: 20,
    alignSelf: "center",
    backgroundColor: musicTheme.orange,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  ctaText: { color: musicTheme.white, fontWeight: "800" },
});
