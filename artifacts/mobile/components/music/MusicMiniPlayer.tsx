import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { absoluteMusicUrl } from "@/lib/musicApi";
import { getPlayerState, next, previous, subscribeMusicPlayer, togglePlayPause } from "@/lib/musicPlayer";
import { musicTheme } from "@/lib/musicTheme";

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function MusicMiniPlayer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState(getPlayerState());

  useEffect(() => subscribeMusicPlayer(setState), []);

  const track = state.track;
  if (!track) return null;
  if (state.adBreakActive) {
    return (
      <View style={[styles.wrap, { bottom: insets.bottom + 58, opacity: 0.55 }]} pointerEvents="none">
        <View style={styles.bar}>
          <Feather name="pause" size={20} color={musicTheme.muted} />
          <Text style={[styles.title, { flex: 1 }]}>Sponsored break</Text>
        </View>
      </View>
    );
  }

  const cover = absoluteMusicUrl(track.cover_url);
  const pct =
    state.durationMillis > 0
      ? Math.min(1, state.positionMillis / state.durationMillis)
      : 0;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 58 }]}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <Pressable
        style={styles.bar}
        onPress={() => router.push("/music/now-playing")}
        accessibilityRole="button"
      >
        {cover ? (
          <Image source={{ uri: cover }} style={styles.art} contentFit="cover" />
        ) : (
          <View style={[styles.art, styles.artFallback]}>
            <Feather name="music" size={18} color={musicTheme.muted} />
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
            {state.durationMillis ? ` · ${formatTime(state.positionMillis)}` : ""}
          </Text>
        </View>
        <Pressable onPress={() => void previous()} hitSlop={8} accessibilityLabel="Previous">
          <Feather name="skip-back" size={22} color={musicTheme.white} />
        </Pressable>
        <Pressable
          onPress={() => void togglePlayPause()}
          hitSlop={8}
          accessibilityLabel={state.isPlaying ? "Pause" : "Play"}
        >
          <Feather
            name={state.isPlaying ? "pause" : "play"}
            size={26}
            color={musicTheme.white}
          />
        </Pressable>
        <Pressable onPress={() => void next()} hitSlop={8} accessibilityLabel="Next">
          <Feather name="skip-forward" size={22} color={musicTheme.white} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 8,
    right: 8,
    zIndex: 50,
    borderRadius: 14,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.15)" },
  progressFill: { height: 3, backgroundColor: musicTheme.orange },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: musicTheme.forest,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  art: { width: 44, height: 44, borderRadius: 8 },
  artFallback: {
    backgroundColor: musicTheme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1, minWidth: 0 },
  title: { color: musicTheme.white, fontWeight: "800", fontSize: 14 },
  artist: { color: musicTheme.muted, fontSize: 12, marginTop: 2 },
});