import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { absoluteMusicUrl, type MusicTrack } from "@/lib/musicApi";
import { musicTheme } from "@/lib/musicTheme";

export function TrackTile({
  track,
  onPress,
  width = 128,
}: {
  track: MusicTrack;
  onPress?: () => void;
  width?: number;
}) {
  const cover = absoluteMusicUrl(track.cover_url);
  const [failed, setFailed] = useState(false);
  return (
    <Pressable style={[styles.tile, { width }]} onPress={onPress} accessibilityRole="button">
      <View style={styles.tileCoverWrap}>
        {cover && !failed ? (
          <Image
            source={{ uri: cover }}
            style={styles.tileCover}
            contentFit="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={[styles.tileCover, styles.coverFallback]}>
            <Feather name="disc" size={28} color={musicTheme.muted} />
          </View>
        )}
        <View style={styles.playFab} pointerEvents="none">
          <Feather name="play" size={12} color="#0B0B0B" />
        </View>
      </View>
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
  const [failed, setFailed] = useState(false);
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      {cover && !failed ? (
        <Image
          source={{ uri: cover }}
          style={styles.rowCover}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
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

export function ArtistChip({
  name,
  coverUrl,
  onPress,
}: {
  name: string;
  coverUrl?: string | null;
  onPress?: () => void;
}) {
  const cover = absoluteMusicUrl(coverUrl);
  const [failed, setFailed] = useState(false);
  return (
    <Pressable style={styles.artist} onPress={onPress} accessibilityRole="button">
      {cover && !failed ? (
        <Image
          source={{ uri: cover }}
          style={styles.artistAvatar}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.artistAvatar, styles.coverFallback]}>
          <Feather name="user" size={22} color={musicTheme.muted} />
        </View>
      )}
      <Text style={styles.artistName} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { marginRight: 12 },
  tileCoverWrap: { position: "relative" },
  tileCover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: musicTheme.card,
  },
  playFab: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: { color: musicTheme.text, fontWeight: "700", fontSize: 13, marginTop: 8 },
  tileArtist: { color: musicTheme.muted, fontSize: 11, marginTop: 2 },
  coverFallback: { alignItems: "center", justifyContent: "center", backgroundColor: musicTheme.card },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: musicTheme.border,
  },
  rowCover: { width: 48, height: 48, borderRadius: 8, backgroundColor: musicTheme.card },
  rowMeta: { flex: 1, minWidth: 0 },
  rowTitle: { color: musicTheme.text, fontWeight: "700", fontSize: 15 },
  rowArtist: { color: musicTheme.muted, fontSize: 12, marginTop: 2 },
  artist: { width: 88, marginRight: 12, alignItems: "center" },
  artistAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: musicTheme.card,
    borderWidth: 2,
    borderColor: musicTheme.emerald,
  },
  artistName: {
    color: musicTheme.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
});
