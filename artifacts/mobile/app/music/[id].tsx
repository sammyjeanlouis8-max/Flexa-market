/**
 * Native song detail — play, like, comment, follow artist. No purchase CTAs.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useMusicPlayer } from "@/context/MusicPlayerContext";
import {
  fetchMusicComments,
  fetchMusicLikes,
  fetchMusicTrack,
  followUser,
  musicCoverUri,
  postMusicComment,
  toggleMusicLike,
  unfollowUser,
  type MusicComment,
  type MusicTrack,
} from "@/lib/musicApi";

export default function MusicTrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const {
    playTrack,
    togglePlay,
    current,
    isPlaying,
    positionMs,
    durationMs,
    seek,
    next,
    previous,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
  } = useMusicPlayer();

  const [track, setTrack] = useState<MusicTrack | null>(null);
  const [likes, setLikes] = useState({ count: 0, liked: false });
  const [comments, setComments] = useState<MusicComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(trackId) || trackId <= 0) {
      setError(t("musicNotFound"));
      return;
    }
    try {
      const [tr, lk, cm] = await Promise.all([
        fetchMusicTrack(trackId, { token }),
        fetchMusicLikes(trackId, { token }).catch(() => ({ count: 0, liked: false })),
        fetchMusicComments(trackId).catch(() => []),
      ]);
      setTrack(tr);
      setLikes(lk);
      setComments(cm);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("musicLoadErr"));
    }
  }, [trackId, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = current?.id === track?.id;
  const progress = Math.min(1, positionMs / Math.max(1, durationMs));
  const cover = track ? musicCoverUri(track) : null;

  const onLike = async () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    try {
      const res = await toggleMusicLike(trackId, { token });
      setLikes(res);
    } catch (e) {
      Alert.alert(t("musicTitle"), e instanceof Error ? e.message : t("musicLikeErr"));
    }
  };

  const onComment = async () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    const content = commentText.trim();
    if (!content) return;
    setBusy(true);
    try {
      await postMusicComment(trackId, content, { token });
      setCommentText("");
      const cm = await fetchMusicComments(trackId);
      setComments(cm);
    } catch (e) {
      Alert.alert(t("musicTitle"), e instanceof Error ? e.message : t("musicCommentErr"));
    } finally {
      setBusy(false);
    }
  };

  const onFollow = async () => {
    if (!token || !track?.artist_user_id) return;
    if (user?.id === track.artist_user_id) return;
    try {
      if (following) {
        await unfollowUser(track.artist_user_id, { token });
        setFollowing(false);
      } else {
        await followUser(track.artist_user_id, { token });
        setFollowing(true);
      }
    } catch (e) {
      Alert.alert(t("musicTitle"), e instanceof Error ? e.message : t("musicFollowErr"));
    }
  };

  if (!track && !error) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#F97316" />
      </View>
    );
  }

  if (error || !track) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>{error || t("musicNotFound")}</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>{t("back")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            Share.share({
              message: `${track.title} — ${track.artist || "Flexa Music"} https://flexamarket.com/music/${track.id}`,
              url: `https://flexamarket.com/music/${track.id}`,
            })
          }
        >
          <Feather name="share-2" size={20} color="#0F172A" />
        </Pressable>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.hero} contentFit="cover" />
            ) : (
              <View style={[styles.hero, styles.coverFallback]}>
                <Feather name="music" size={48} color="#fff" />
              </View>
            )}
            <Text style={styles.heroTitle}>{track.title}</Text>
            <Text style={styles.heroArtist}>{track.artist || "—"}</Text>
            {track.album || track.genre ? (
              <Text style={styles.meta}>
                {[track.album, track.genre].filter(Boolean).join(" · ")}
              </Text>
            ) : null}

            <Text style={styles.freeNote}>{t("musicFreeNote")}</Text>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${active ? progress * 100 : 0}%` }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.time}>{fmt(active ? positionMs : 0)}</Text>
              <Text style={styles.time}>{fmt(active ? durationMs : (track.duration_seconds ?? 0) * 1000)}</Text>
            </View>

            <View style={styles.controls}>
              <Pressable onPress={toggleShuffle}>
                <Feather name="shuffle" size={20} color={shuffle ? "#F97316" : "#64748B"} />
              </Pressable>
              <Pressable onPress={() => void previous()}>
                <Feather name="skip-back" size={26} color="#0F172A" />
              </Pressable>
              <Pressable
                style={styles.mainPlay}
                onPress={() => {
                  if (active) void togglePlay();
                  else void playTrack(track);
                }}
              >
                <Feather name={active && isPlaying ? "pause" : "play"} size={28} color="#fff" />
              </Pressable>
              <Pressable onPress={() => void next()}>
                <Feather name="skip-forward" size={26} color="#0F172A" />
              </Pressable>
              <Pressable onPress={cycleRepeat}>
                <Feather
                  name="repeat"
                  size={20}
                  color={repeat === "off" ? "#64748B" : "#F97316"}
                />
              </Pressable>
            </View>

            <View style={styles.seekRow}>
              <Pressable
                style={styles.seekBtn}
                onPress={() => void seek(Math.max(0, positionMs - 15000))}
              >
                <Text style={styles.seekText}>-15s</Text>
              </Pressable>
              <Pressable
                style={styles.seekBtn}
                onPress={() => void seek(Math.min(durationMs, positionMs + 15000))}
              >
                <Text style={styles.seekText}>+15s</Text>
              </Pressable>
            </View>

            <View style={styles.socialRow}>
              <Pressable style={styles.socialBtn} onPress={() => void onLike()}>
                <Feather name="heart" size={18} color={likes.liked ? "#EF4444" : "#0F172A"} />
                <Text style={styles.socialText}>{likes.count}</Text>
              </Pressable>
              {track.artist_user_id && user?.id !== track.artist_user_id ? (
                <Pressable style={styles.socialBtn} onPress={() => void onFollow()}>
                  <Feather name="user-plus" size={18} color="#0F172A" />
                  <Text style={styles.socialText}>{following ? t("musicFollowing") : t("musicFollow")}</Text>
                </Pressable>
              ) : null}
            </View>

            {track.lyrics ? (
              <View style={styles.lyricsBox}>
                <Text style={styles.section}>{t("musicLyrics")}</Text>
                <Text style={styles.lyrics}>{track.lyrics}</Text>
              </View>
            ) : null}

            <Text style={styles.section}>{t("musicComments")}</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.meta}>{t("musicNoComments")}</Text>}
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <Text style={styles.commentUser}>{item.user_name || "User"}</Text>
            <Text style={styles.commentBody}>{item.content}</Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.commentComposer}>
            <TextInput
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={t("musicCommentPlaceholder")}
              placeholderTextColor="#94A3B8"
              maxLength={500}
            />
            <Pressable style={styles.send} onPress={() => void onComment()} disabled={busy}>
              <Feather name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  center: { alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: "#0F172A" },
  hero: { width: "100%", aspectRatio: 1, borderRadius: 18, backgroundColor: "#0F172A" },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  heroArtist: { fontSize: 15, color: "#64748B", fontWeight: "600" },
  meta: { color: "#94A3B8", fontSize: 12 },
  freeNote: {
    backgroundColor: "#ECFDF5",
    color: "#047857",
    padding: 10,
    borderRadius: 10,
    fontWeight: "700",
    fontSize: 12,
  },
  progressTrack: { height: 4, backgroundColor: "#E2E8F0", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: "#F97316" },
  timeRow: { flexDirection: "row", justifyContent: "space-between" },
  time: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 8,
  },
  mainPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  seekRow: { flexDirection: "row", justifyContent: "center", gap: 12 },
  seekBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  seekText: { fontWeight: "700", color: "#0F172A", fontSize: 12 },
  socialRow: { flexDirection: "row", gap: 10 },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  socialText: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  lyricsBox: { backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  lyrics: { color: "#334155", lineHeight: 20, fontSize: 13 },
  section: { fontWeight: "800", color: "#0F172A", fontSize: 15 },
  comment: { backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  commentUser: { fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  commentBody: { color: "#334155", lineHeight: 18 },
  commentComposer: { flexDirection: "row", gap: 8, marginTop: 8 },
  commentInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: "#0F172A",
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontWeight: "800", color: "#0F172A", fontSize: 16 },
  backLink: { marginTop: 12 },
  backLinkText: { color: "#F97316", fontWeight: "800" },
});
