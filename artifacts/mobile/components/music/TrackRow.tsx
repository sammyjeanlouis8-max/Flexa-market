import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { absoluteMusicUrl, type MusicTrack } from "@/lib/musicApi";
import { musicTheme } from "@/lib/musicTheme";

export function TrackTile({
  track,
  onPress,
  width = 140,
}: {
  track: MusicTrack;
  onPress?: () => void;
  width?: number;
}) {
  const cover = absoluteMusicUrl(track.cover_url);
  return (
    <Pressable style={[styles.tile, { width }]} onPress={onPress}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.tileCover} contentFit="cover" />
      ) : (
        <View style={[styles.tileCover, styles.coverFallback]}>
          <Feather name="disc" size={28} color={musicTheme.muted} />
        </View>
      )}
      <Text style={styles.tileTitle} numberOfLines={1}>
        {track.title}
      </Text>
      <Text style={styles.tileArtist} numberOfLines={1}>
        {track.artist}
      </Text>
    </Pressable>
  );
}

export function TrackListRow({
  track,
  onPress,
  right,
}: {
  track: MusicTrack;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const cover = absoluteMusicUrl(track.cover_url);
  return (
    <Pressable style={styles.row} onPress={onPress}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.rowCover} contentFit="cover" />
      ) : (
        <View style={[styles.rowCover, styles.coverFallback]}>
          <Feather name="music" size={16} color={musicTheme.muted} />
        </View>
      )}
      <View style={styles.rowMeta}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.rowArtist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      {right ?? <Feather name="play-circle" size={22} color={musicTheme.orange} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { marginRight: 12 },
  tileCover: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: musicTheme.surface },
  tileTitle: { color: musicTheme.white, fontWeight: "700", fontSize: 13, marginTop: 8 },
  tileArtist: { color: musicTheme.muted, fontSize: 11, marginTop: 2 },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: musicTheme.line,
  },
  rowCover: { width: 48, height: 48, borderRadius: 8, backgroundColor: musicTheme.surface },
  rowMeta: { flex: 1, minWidth: 0 },
  rowTitle: { color: musicTheme.white, fontWeight: "700", fontSize: 15 },
  rowArtist: { color: musicTheme.muted, fontSize: 12, marginTop: 2 },
});