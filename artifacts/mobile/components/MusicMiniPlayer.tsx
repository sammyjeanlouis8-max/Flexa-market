/**
 * Persistent mini-player shown above tab bar when a track is loaded.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMusicPlayer } from "@/context/MusicPlayerContext";
import { musicCoverUri } from "@/lib/musicApi";

export function MusicMiniPlayer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { current, isPlaying, togglePlay, next, previous, positionMs, durationMs } =
    useMusicPlayer();

  if (!current) return null;
  const cover = musicCoverUri(current);
  const progress = Math.min(1, positionMs / Math.max(1, durationMs));

  return (
    <View style={[styles.root, { bottom: Math.max(insets.bottom, 8) + 56 }]}>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Pressable
        style={styles.row}
        onPress={() => router.push(`/music/${current.id}`)}
        accessibilityRole="button"
      >
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Feather name="music" size={16} color="#fff" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{current.artist || "Unknown"}</Text>
        </View>
        <Pressable style={styles.btn} onPress={() => void previous()} hitSlop={8}>
          <Feather name="skip-back" size={18} color="#0F172A" />
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void togglePlay()} hitSlop={8}>
          <Feather name={isPlaying ? "pause" : "play"} size={20} color="#0F172A" />
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void next()} hitSlop={8}>
          <Feather name="skip-forward" size={18} color="#0F172A" />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 50,
  },
  progress: { height: 3, backgroundColor: "#E2E8F0" },
  progressFill: { height: 3, backgroundColor: "#F97316" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  cover: { width: 40, height: 40, borderRadius: 8 },
  coverFallback: { backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "800", color: "#0F172A", fontSize: 13 },
  artist: { color: "#64748B", fontSize: 11 },
  btn: { padding: 6 },
});
