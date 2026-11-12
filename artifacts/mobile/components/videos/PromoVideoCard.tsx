import { Feather } from "@expo/vector-icons";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { Image } from "expo-image";
import React, { useEffect, useRef } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { PromoVideo } from "@/lib/videosApi";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

type Props = {
  item: PromoVideo;
  active: boolean;
  muted: boolean;
  bottomInset: number;
  onToggleMute: () => void;
  onBuy: () => void;
  onOpenListing: () => void;
};

export default function PromoVideoCard({
  item,
  active,
  muted,
  bottomInset,
  onToggleMute,
  onBuy,
  onOpenListing,
}: Props) {
  const ref = useRef<Video>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (active) {
          await ref.current?.playAsync();
        } else {
          await ref.current?.pauseAsync();
          await ref.current?.setPositionAsync(0);
        }
      } catch {
        /* ignore playback races */
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    ref.current?.setIsMutedAsync(muted).catch(() => {});
  }, [muted]);

  const price = Number(item.price || 0);
  const currency =
    item.currency === "HTG" ? "G" : item.currency === "DOP" ? "RD$" : "$";

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      ref.current?.replayAsync().catch(() => {});
    }
  };

  return (
    <View style={[styles.page, { height: SCREEN_H }]}>
      {item.videoUrl ? (
        <Video
          ref={ref}
          source={{ uri: item.videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={active}
          isMuted={muted}
          onPlaybackStatusUpdate={onStatus}
          usePoster={!!item.thumbnailUrl}
          posterSource={item.thumbnailUrl ? { uri: item.thumbnailUrl } : undefined}
        />
      ) : (
        <View style={[styles.video, styles.fallback]}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.video} contentFit="cover" />
          ) : null}
        </View>
      )}

      <View style={[styles.overlay, { paddingBottom: bottomInset + 24 }]}>
        <Pressable style={styles.meta} onPress={onOpenListing}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.seller} numberOfLines={1}>
            {item.sellerName || "Seller"}
            {item.sellerIsVerified ? " · verified" : ""}
          </Text>
          {!item.isVideoOnly && price > 0 ? (
            <Text style={styles.price}>
              {currency}
              {price.toFixed(2)}
            </Text>
          ) : null}
        </Pressable>

        <View style={styles.actions}>
          <Pressable style={styles.iconBtn} onPress={onToggleMute}>
            <Feather name={muted ? "volume-x" : "volume-2"} size={22} color="#fff" />
          </Pressable>
          {!item.isVideoOnly ? (
            <Pressable style={styles.buyBtn} onPress={onBuy}>
              <Text style={styles.buyText}>View</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: SCREEN_W,
    backgroundColor: "#000",
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: { backgroundColor: "#111" },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  meta: { flex: 1, gap: 4 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  seller: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  price: { color: "#FDBA74", fontSize: 15, fontWeight: "800", marginTop: 2 },
  actions: { alignItems: "center", gap: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtn: {
    backgroundColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buyText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
