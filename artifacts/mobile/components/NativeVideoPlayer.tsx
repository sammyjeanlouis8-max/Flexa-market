/**
 * Native video player powered by expo-av.
 * Only the mounted instance should play; unmount pauses/unloads.
 * Shows poster (thumbnail → product photo → light placeholder) until playback starts.
 */
import { Feather } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useMusicPlayer } from "@/context/MusicPlayerContext";
import { absoluteMediaUrl } from "@/lib/mediaUrl";
import { VideoPoster } from "@/components/VideoPoster";

type Props = {
  uri: string;
  title?: string;
  posterUrl?: string | null;
  productPhotoUrl?: string | null;
  autoPlay?: boolean;
  /** When false, immediately stop/unload so scrolling Video A→B cannot overlap audio. */
  active?: boolean;
  onFullscreen?: () => void;
};

export function NativeVideoPlayer({
  uri,
  title,
  posterUrl,
  productPhotoUrl,
  autoPlay = true,
  active = true,
  onFullscreen,
}: Props) {
  const videoRef = useRef<Video>(null);
  const { pauseForVideo } = useMusicPlayer();
  const { width } = useWindowDimensions();
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const resolvedUri = absoluteMediaUrl(uri) ?? uri;

  useEffect(() => {
    void pauseForVideo();
  }, [uri, pauseForVideo]);

  useEffect(() => {
    setReady(false);
    setError(null);
    setStatus(null);
  }, [uri]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      if (autoPlay) void v.playAsync().catch(() => {});
      return;
    }
    void v.stopAsync().catch(() => {});
    void v.setStatusAsync({ shouldPlay: false, isMuted: true }).catch(() => {});
  }, [active, autoPlay, uri]);

  useEffect(() => {
    return () => {
      void videoRef.current?.stopAsync().catch(() => {});
      void videoRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const playing = status?.isLoaded ? status.isPlaying : false;
  const position = status?.isLoaded ? status.positionMillis : 0;
  const duration = status?.isLoaded ? status.durationMillis ?? 1 : 1;
  const progress = Math.min(1, position / Math.max(1, duration));
  const height = Math.min(width / Math.max(0.5, aspect), width * 1.4);
  const showPoster = !playing && (!autoPlay || !active || !ready);

  const toggle = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) await v.pauseAsync();
    else await v.playAsync();
  };

  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={[styles.stage, { height }]}>
        <Video
          ref={videoRef}
          style={StyleSheet.absoluteFill}
          source={{ uri: resolvedUri }}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls={false}
          shouldPlay={autoPlay && active}
          isMuted={muted || !active}
          onLoad={() => setReady(true)}
          onReadyForDisplay={(e) => {
            const w = e?.naturalSize?.width;
            const h = e?.naturalSize?.height;
            if (w && h) setAspect(w / h);
          }}
          onError={() => setError("Playback failed")}
          onPlaybackStatusUpdate={(s) => setStatus(s)}
        />
        {showPoster ? (
          <VideoPoster
            thumbnailUrl={posterUrl}
            productPhotoUrl={productPhotoUrl}
            style={StyleSheet.absoluteFill}
            playIconSize={28}
            testID="native-video-poster"
          />
        ) : null}
        {!ready && !error && !showPoster ? (
          <View style={styles.overlay}>
            <ActivityIndicator color="#F97316" />
          </View>
        ) : null}
        {error ? (
          <View style={styles.overlay}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.controls}>
        <Pressable style={styles.ctrl} onPress={toggle} accessibilityLabel="Play or pause">
          <Feather name={playing ? "pause" : "play"} size={22} color="#0F172A" />
        </Pressable>
        <Pressable
          style={styles.ctrl}
          onPress={() => setMuted((m) => !m)}
          accessibilityLabel="Mute"
        >
          <Feather name={muted ? "volume-x" : "volume-2"} size={20} color="#0F172A" />
        </Pressable>
        <Pressable
          style={styles.ctrl}
          onPress={async () => {
            const next = Math.max(0, position - 10000);
            await videoRef.current?.setPositionAsync(next);
          }}
        >
          <Feather name="rotate-ccw" size={18} color="#0F172A" />
        </Pressable>
        <Pressable
          style={styles.ctrl}
          onPress={async () => {
            const next = Math.min(duration, position + 10000);
            await videoRef.current?.setPositionAsync(next);
          }}
        >
          <Feather name="rotate-cw" size={18} color="#0F172A" />
        </Pressable>
        <Pressable
          style={styles.ctrl}
          onPress={async () => {
            try {
              await videoRef.current?.presentFullscreenPlayer();
            } catch {
              onFullscreen?.();
            }
          }}
        >
          <Feather name="maximize" size={18} color="#0F172A" />
        </Pressable>
        <Text style={styles.time}>
          {fmt(position)} / {fmt(duration)}
        </Text>
      </View>
    </View>
  );
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontWeight: "800", color: "#0F172A", fontSize: 16 },
  stage: {
    width: "100%",
    backgroundColor: "#E8EEF5",
    borderRadius: 14,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  error: { color: "#fff", fontWeight: "700" },
  barTrack: { height: 4, backgroundColor: "#E2E8F0", borderRadius: 2, overflow: "hidden" },
  barFill: { height: 4, backgroundColor: "#F97316" },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  ctrl: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  time: { marginLeft: "auto", color: "#64748B", fontSize: 12, fontWeight: "600" },
});
