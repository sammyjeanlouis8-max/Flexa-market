import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ResizeMode, Video } from "expo-av";
import { MusicShell } from "@/components/music/MusicShell";
import {
  clearSponsoredAdHistory,
  clearUnseenSponsoredAdCount,
  loadSponsoredAdHistory,
  type SponsoredAdHistoryEntry,
} from "@/lib/musicAdBreak";
import { musicTheme } from "@/lib/musicTheme";

export default function SponsoredAdsScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<SponsoredAdHistoryEntry[]>([]);
  const [watch, setWatch] = useState<SponsoredAdHistoryEntry | null>(null);

  const refresh = useCallback(async () => {
    setHistory(await loadSponsoredAdHistory());
    await clearUnseenSponsoredAdCount();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onClear = () => {
    Alert.alert("Clear history?", "Remove all recent sponsored ads you heard in the background.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          void clearSponsoredAdHistory().then(refresh);
        },
      },
    ]);
  };

  const openProduct = (entry: SponsoredAdHistoryEntry) => {
    if (entry.productPath) router.push(entry.productPath as never);
  };

  return (
    <MusicShell
      title="Recent Sponsored Ads"
      showNav={false}
      headerRight={
        history.length ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null
      }
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {history.length === 0 ? (
          <Text style={styles.muted}>
            Ads you hear while Flexa Music runs in the background will show up here.
          </Text>
        ) : (
          history.map((entry) => (
            <View key={entry.id} style={styles.row}>
              {entry.thumbnail ? (
                <Image source={{ uri: entry.thumbnail }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Feather name="film" size={20} color={musicTheme.muted} />
                </View>
              )}
              <View style={styles.meta}>
                <Text style={styles.title} numberOfLines={2}>
                  {entry.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {entry.advertiser ? `by ${entry.advertiser}` : "Sponsored"}
                  {entry.heardInBackground ? " · Heard in background" : ""}
                </Text>
              </View>
              <Pressable style={styles.watch} onPress={() => setWatch(entry)}>
                <Text style={styles.watchText}>Watch</Text>
              </Pressable>
              {entry.productPath ? (
                <Pressable onPress={() => openProduct(entry)} hitSlop={8}>
                  <Feather name="shopping-bag" size={20} color={musicTheme.orange} />
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!watch} animationType="slide" onRequestClose={() => setWatch(null)}>
        <View style={styles.modal}>
          <Pressable style={styles.modalClose} onPress={() => setWatch(null)}>
            <Feather name="x" size={28} color={musicTheme.white} />
          </Pressable>
          {watch ? (
            <Video
              source={{ uri: watch.videoUrl }}
              style={styles.modalVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              useNativeControls
            />
          ) : null}
          <Text style={styles.modalNote}>Manual replays do not affect your listening ad schedule.</Text>
        </View>
      </Modal>
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  clear: { color: musicTheme.orange, fontWeight: "700" },
  muted: { color: musicTheme.muted, marginTop: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: musicTheme.line,
  },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbFallback: {
    backgroundColor: musicTheme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1, minWidth: 0 },
  title: { color: musicTheme.white, fontWeight: "800", fontSize: 14 },
  sub: { color: musicTheme.muted, fontSize: 12, marginTop: 4 },
  watch: {
    backgroundColor: musicTheme.forest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: musicTheme.line,
  },
  watchText: { color: musicTheme.orange, fontWeight: "800", fontSize: 12 },
  modal: {
    flex: 1,
    backgroundColor: musicTheme.charcoal,
    justifyContent: "center",
    padding: 16,
  },
  modalClose: { position: "absolute", top: 48, right: 16, zIndex: 2 },
  modalVideo: { width: "100%", aspectRatio: 9 / 16, maxHeight: "70%", alignSelf: "center" },
  modalNote: {
    color: musicTheme.muted,
    textAlign: "center",
    marginTop: 16,
    fontSize: 12,
  },
});