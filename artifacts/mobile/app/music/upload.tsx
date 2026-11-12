/**
 * Native Flexa Music upload — signature + Wasabi put-proxy + register.
 * Paid artist plan / digital purchases stay blocked on Android.
 * Drafts saved locally for recovery after interruption.
 */
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchMusicArtistPlan,
  putMusicFile,
  registerMusicTrack,
  requestMusicUploadSignature,
} from "@/lib/musicApi";
import { clearMusicDraft, loadMusicDraft, saveMusicDraft } from "@/lib/musicDrafts";

const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
];

type PickedAudio = {
  uri: string;
  name: string;
  mime: string;
  size: number;
};

type PickedCover = {
  uri: string;
  mime: string;
  size: number;
};

export default function MusicUploadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [genre, setGenre] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audio, setAudio] = useState<PickedAudio | null>(null);
  const [cover, setCover] = useState<PickedCover | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
    }
  }, [authLoading, token, router]);

  useEffect(() => {
    void (async () => {
      const draft = await loadMusicDraft();
      if (!draft) return;
      setTitle(draft.title || "");
      setArtist(draft.artist || "");
      setAlbum(draft.album || "");
      setGenre(draft.genre || "");
      setLyrics(draft.lyrics || "");
      if (draft.audioUri && draft.audioSize && draft.audioMime) {
        setAudio({
          uri: draft.audioUri,
          name: draft.audioName || "audio",
          mime: draft.audioMime,
          size: draft.audioSize,
        });
      }
      if (draft.coverUri && draft.coverSize && draft.coverMime) {
        setCover({
          uri: draft.coverUri,
          mime: draft.coverMime,
          size: draft.coverSize,
        });
      }
      setStatus(t("musicDraftRestored"));
    })();
  }, [t]);

  const persistDraft = async (next?: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    lyrics?: string;
    audio?: PickedAudio | null;
    cover?: PickedCover | null;
  }) => {
    const a = next?.audio === undefined ? audio : next.audio;
    const c = next?.cover === undefined ? cover : next.cover;
    await saveMusicDraft({
      title: next?.title ?? title,
      artist: next?.artist ?? artist,
      album: next?.album ?? album,
      genre: next?.genre ?? genre,
      lyrics: next?.lyrics ?? lyrics,
      audioUri: a?.uri,
      audioName: a?.name,
      audioMime: a?.mime,
      audioSize: a?.size,
      coverUri: c?.uri,
      coverMime: c?.mime,
      coverSize: c?.size,
    });
  };

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: AUDIO_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || "audio/mpeg";
    const size = asset.size || 0;
    if (!size) {
      Alert.alert(t("musicUploadTitle"), t("musicFileInvalid"));
      return;
    }
    const picked: PickedAudio = {
      uri: asset.uri,
      name: asset.name || "track.mp3",
      mime,
      size,
    };
    setAudio(picked);
    await persistDraft({ audio: picked });
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("musicUploadTitle"), t("musicCoverPerm"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fileRes = await fetch(asset.uri);
    const blob = await fileRes.blob();
    const picked: PickedCover = {
      uri: asset.uri,
      mime: asset.mimeType || blob.type || "image/jpeg",
      size: blob.size,
    };
    setCover(picked);
    await persistDraft({ cover: picked });
  };

  const onUpload = async () => {
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    if (!title.trim() || !artist.trim()) {
      Alert.alert(t("musicUploadTitle"), t("musicMetaRequired"));
      return;
    }
    if (!audio) {
      Alert.alert(t("musicUploadTitle"), t("musicAudioRequired"));
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatus(t("musicCheckingPlan"));
    setPlanBlocked(false);

    try {
      const plan = await fetchMusicArtistPlan({ token });
      if (!plan.canUpload) {
        setPlanBlocked(true);
        setStatus(t("musicPlanRequired"));
        setUploading(false);
        return;
      }

      setStatus(t("musicRequestingUpload"));
      const sig = await requestMusicUploadSignature(
        {
          audio: { size: audio.size, contentType: audio.mime, name: audio.name },
          cover: cover
            ? { size: cover.size, contentType: cover.mime, name: "cover.jpg" }
            : null,
        },
        { token },
      );

      setStatus(t("musicUploadingAudio"));
      const storageKey = await putMusicFile(audio.uri, sig.audio.uploadUrl, {
        token,
        contentType: audio.mime,
        expectedBytes: audio.size,
        onProgress: (pct) => setProgress(Math.round(pct * 0.85)),
      });

      let coverStorageKey: string | undefined;
      if (cover && sig.cover?.uploadUrl) {
        setStatus(t("musicUploadingCover"));
        coverStorageKey = await putMusicFile(cover.uri, sig.cover.uploadUrl, {
          token,
          contentType: cover.mime,
          expectedBytes: cover.size,
          onProgress: (pct) => setProgress(85 + Math.round(pct * 0.1)),
        });
      }

      setProgress(95);
      setStatus(t("musicRegistering"));
      const track = await registerMusicTrack(
        {
          title: title.trim(),
          artist: artist.trim(),
          album: album.trim() || undefined,
          genre: genre.trim() || undefined,
          lyrics: lyrics.trim() || undefined,
          storageKey,
          coverStorageKey,
        },
        { token },
      );

      setProgress(100);
      setStatus(t("musicUploadDone"));
      await clearMusicDraft();
      Alert.alert(t("musicUploadTitle"), t("musicUploadDone"), [
        {
          text: t("ok"),
          onPress: () => router.replace(`/music/${track.id}`),
        },
      ]);
    } catch (e: any) {
      if (e?.code === "ARTIST_PLAN_REQUIRED" || e?.message === "ARTIST_PLAN_REQUIRED") {
        setPlanBlocked(true);
        setStatus(t("musicPlanRequired"));
      } else {
        setStatus(e instanceof Error ? e.message : t("musicUploadFailed"));
        Alert.alert(t("musicUploadTitle"), e instanceof Error ? e.message : t("musicUploadFailed"));
      }
      await persistDraft();
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 16,
        gap: 12,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topBar}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("musicUploadTitle")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.banner}>{t("musicUploadBanner")}</Text>
      {planBlocked ? <Text style={styles.blocked}>{t("musicPlanBlockedNote")}</Text> : null}

      <Field label={t("musicFieldTitle")} value={title} onChangeText={(v) => { setTitle(v); void persistDraft({ title: v }); }} />
      <Field label={t("musicFieldArtist")} value={artist} onChangeText={(v) => { setArtist(v); void persistDraft({ artist: v }); }} />
      <Field label={t("musicFieldAlbum")} value={album} onChangeText={(v) => { setAlbum(v); void persistDraft({ album: v }); }} />
      <Field label={t("musicFieldGenre")} value={genre} onChangeText={(v) => { setGenre(v); void persistDraft({ genre: v }); }} />
      <Field
        label={t("musicLyrics")}
        value={lyrics}
        onChangeText={(v) => { setLyrics(v); void persistDraft({ lyrics: v }); }}
        multiline
      />

      <Pressable style={styles.pick} onPress={() => void pickAudio()} disabled={uploading}>
        <Feather name="music" size={18} color="#0F172A" />
        <Text style={styles.pickText}>
          {audio ? `${audio.name} (${Math.round(audio.size / 1024)} KB)` : t("musicPickAudio")}
        </Text>
      </Pressable>
      <Text style={styles.hint}>{t("musicFormats")}</Text>

      <Pressable style={styles.pick} onPress={() => void pickCover()} disabled={uploading}>
        <Feather name="image" size={18} color="#0F172A" />
        <Text style={styles.pickText}>{cover ? t("musicCoverPicked") : t("musicPickCover")}</Text>
      </Pressable>

      {uploading || progress > 0 ? (
        <View style={styles.progressBox}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      ) : null}

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <Pressable
        style={[styles.submit, uploading && { opacity: 0.6 }]}
        onPress={() => void onUpload()}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{t("musicStartUpload")}</Text>
        )}
      </Pressable>

      <Pressable
        style={styles.clearDraft}
        onPress={() => {
          void clearMusicDraft();
          setAudio(null);
          setCover(null);
          setStatus(t("musicDraftCleared"));
        }}
      >
        <Text style={styles.clearDraftText}>{t("musicClearDraft")}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 96, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#0F172A" },
  banner: { color: "#64748B", fontSize: 13, lineHeight: 18 },
  blocked: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    padding: 10,
    borderRadius: 10,
    fontWeight: "700",
    fontSize: 12,
  },
  label: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#0F172A",
    fontSize: 15,
  },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
  },
  pickText: { flex: 1, color: "#0F172A", fontWeight: "600" },
  hint: { color: "#94A3B8", fontSize: 12, marginTop: -4 },
  progressBox: { gap: 6 },
  progressTrack: { height: 8, backgroundColor: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: "#F97316" },
  progressText: { fontWeight: "800", color: "#0F172A" },
  status: { color: "#64748B", fontSize: 13 },
  submit: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  clearDraft: { alignItems: "center", padding: 8 },
  clearDraftText: { color: "#64748B", fontWeight: "700" },
});
