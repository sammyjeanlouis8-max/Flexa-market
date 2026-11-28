import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarHeight } from "@/hooks/useTabContentInsets";
import { absoluteMusicUrl } from "@/lib/musicApi";
import { getPlayerState, next, previous, subscribeMusicPlayer, togglePlayPause } from "@/lib/musicPlayer";
import { MUSIC_TAB_BAR_CONTENT, musicTheme } from "@/lib/musicTheme";

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function isMusicModulePath(pathname: string) {
  return (
    pathname === "/music" ||
    pathname.startsWith("/music/") ||
    pathname.includes("(tabs)/music") ||
    pathname.endsWith("/music")
  );
}

export function MusicMiniPlayer() {
  const marketTabBarHeight = useTabBarHeight();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState(getPlayerState());

  useEffect(() => subscribeMusicPlayer(setState), []);

  const track = state.track;
  if (!track) return null;
  if (pathname.includes("/music/now-playing")) return null;

  const inMusic = isMusicModulePath(pathname);
  const musicNav = MUSIC_TAB_BAR_CONTENT + (insets.bottom > 0 ? insets.bottom : 8);
  const bottom = (inMusic ? musicNav : marketTabBarHeight) + 8;

  if (state.adBreakActive) {
    return (
      <View style={[styles.wrap, { bottom, opacity: 0.55 }]} pointerEvents="none">
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
    <View style={[styles.wrap, { bottom }]} testID="music-mini-player">
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
          </Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
            </View>
            <Text style={styles.time}>
              {formatTime(state.positionMillis)}
              {state.durationMillis ? ` / ${formatTime(state.durationMillis)}` : ""}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => void previous()} hitSlop={8} accessibilityLabel="Previous">
          <Feather name="skip-back" size={20} color={musicTheme.text} />
        </Pressable>
        <Pressable
          style={styles.playCircle}
          onPress={() => void togglePlayPause()}
          hitSlop={8}
          accessibilityLabel={state.isPlaying ? "Pause" : "Play"}
        >
          <Feather
            name={state.isPlaying ? "pause" : "play"}
            size={18}
            color={musicTheme.white}
          />
        </Pressable>
        <Pressable onPress={() => void next()} hitSlop={8} accessibilityLabel="Next">
          <Feather name="skip-forward" size={20} color={musicTheme.text} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/music/now-playing")}
          hitSlop={8}
          accessibilityLabel="Queue"
        >
          <Feather name="list" size={18} color={musicTheme.muted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 50,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: musicTheme.border,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: musicTheme.secondary,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  art: { width: 44, height: 44, borderRadius: 8 },
  artFallback: {
    backgroundColor: musicTheme.card,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1, minWidth: 0 },
  title: { color: musicTheme.text, fontWeight: "800", fontSize: 13 },
  artist: { color: musicTheme.muted, fontSize: 11, marginTop: 1 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: musicTheme.border,
    overflow: "hidden",
  },
  progressFill: { height: 3, backgroundColor: musicTheme.orange },
  time: { color: musicTheme.muted, fontSize: 9, fontVariant: ["tabular-nums"] },
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: musicTheme.orange,
    alignItems: "center",
    justifyContent: "center",
  },
});
