import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { absoluteMusicUrl } from "@/lib/musicApi";
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
import { TrackListRow } from "@/components/music/TrackRow";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<PlayerState>(getPlayerState());

  useEffect(() => subscribeMusicPlayer(setState), []);

  const track = state.track;
  const cover = track ? absoluteMusicUrl(track.cover_url) : null;
  const progress =
    state.durationMillis > 0 ? state.positionMillis / state.durationMillis : 0;

  const cycleRepeat = () => {
    const order: PlayerState["repeat"][] = ["off", "all", "one"];
    const i = order.indexOf(state.repeat);
    setRepeat(order[(i + 1) % order.length]);
  };

  if (!track) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="chevron-down" size={28} color={musicTheme.white} />
        </Pressable>
        <Text style={styles.empty}>Nothing playing yet.</Text>
        <Pressable style={styles.cta} onPress={() => router.replace("/(tabs)/music")}>
          <Text style={styles.ctaText}>Browse music</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-down" size={28} color={musicTheme.white} />
        </Pressable>
        <Text style={styles.now}>Now playing</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.vinylWrap}>
        <View style={styles.vinylRing}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.vinylArt} contentFit="cover" />
          ) : (
            <View style={[styles.vinylArt, styles.vinylFb]}>
              <Feather name="disc" size={64} color={musicTheme.orange} />
            </View>
          )}
        </View>
      </View>

      <Text style={styles.title}>{track.title}</Text>
      <Text style={styles.artist}>{track.artist}</Text>

      <View style={styles.scrubber}>
        <View style={styles.scrubTrack}>
          <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.scrubLabels}>
          <Text style={styles.time}>{fmt(state.positionMillis)}</Text>
          <Text style={styles.time}>{fmt(state.durationMillis)}</Text>
        </View>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => {
            const w = e.nativeEvent.locationX;
            void seek(progress * state.durationMillis);
          }}
        />
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => setShuffle(!state.shuffle)}>
          <Feather
            name="shuffle"
            size={22}
            color={state.shuffle ? musicTheme.orange : musicTheme.muted}
          />
        </Pressable>
        <Pressable onPress={() => void previous()}>
          <Feather name="skip-back" size={28} color={musicTheme.white} />
        </Pressable>
        <Pressable style={styles.bigPlay} onPress={() => void togglePlayPause()}>
          <Feather
            name={state.isPlaying ? "pause" : "play"}
            size={32}
            color={musicTheme.white}
          />
        </Pressable>
        <Pressable onPress={() => void next()}>
          <Feather name="skip-forward" size={28} color={musicTheme.white} />
        </Pressable>
        <Pressable onPress={cycleRepeat}>
          <Feather
            name="repeat"
            size={22}
            color={state.repeat !== "off" ? musicTheme.orange : musicTheme.muted}
          />
        </Pressable>
      </View>

      <Text style={styles.upNext}>Up next</Text>
      <ScrollView style={styles.queue} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {state.queue.map((t, i) => (
          <TrackListRow
            key={`${t.id}-${i}`}
            track={t}
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
  root: { flex: 1, backgroundColor: musicTheme.charcoal, paddingHorizontal: 20 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  now: { color: musicTheme.muted, fontWeight: "700" },
  vinylWrap: { alignItems: "center", marginVertical: 24 },
  vinylRing: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 10,
    borderColor: musicTheme.forest,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: musicTheme.surface,
  },
  vinylArt: { width: 200, height: 200, borderRadius: 100 },
  vinylFb: { alignItems: "center", justifyContent: "center" },
  title: { color: musicTheme.white, fontSize: 24, fontWeight: "800", textAlign: "center" },
  artist: { color: musicTheme.muted, textAlign: "center", marginTop: 6, marginBottom: 20 },
  scrubber: { marginBottom: 8 },
  scrubTrack: { height: 4, backgroundColor: musicTheme.line, borderRadius: 2, overflow: "hidden" },
  scrubFill: { height: 4, backgroundColor: musicTheme.orange },
  scrubLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  time: { color: musicTheme.muted, fontSize: 11 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginVertical: 16,
  },
  bigPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: musicTheme.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  upNext: {
    color: musicTheme.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
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