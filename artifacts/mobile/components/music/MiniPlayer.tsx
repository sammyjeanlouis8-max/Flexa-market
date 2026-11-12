import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMusicPlayer } from "@/context/MusicPlayerContext";

export default function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { track, playing, toggle, stop } = useMusicPlayer();
  if (!track) return null;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <Pressable style={styles.main} onPress={() => router.push("/music")}>
        {track.coverUrl ? (
          <Image source={{ uri: track.coverUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]}>
            <Feather name="music" size={16} color="#94A3B8" />
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist || "Flexa Music"}
          </Text>
        </View>
      </Pressable>
      <Pressable style={styles.iconBtn} onPress={() => void toggle()}>
        <Feather name={playing ? "pause" : "play"} size={20} color="#0F172A" />
      </Pressable>
      <Pressable style={styles.iconBtn} onPress={() => void stop()}>
        <Feather name="x" size={18} color="#64748B" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  cover: { width: 40, height: 40, borderRadius: 8, backgroundColor: "#E2E8F0" },
  coverEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  artist: { fontSize: 12, color: "#64748B" },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
