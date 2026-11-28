import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MusicShell } from "@/components/music/MusicShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  proxyUploadUrl,
  registerMusicTrack,
  requestMusicUploadSignature,
} from "@/lib/musicApi";
import { musicTheme } from "@/lib/musicTheme";

const DRAFT_KEY = "flexa_music_upload_draft";

function extractKeyFromProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl, "https://flexamarket.com");
    const fromQuery = u.searchParams.get("key");
    if (fromQuery) return fromQuery;
    const parts = u.pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch {
    return "";
  }
}

async function putFile(uri: string, uploadUrl: string, contentType: string, token: string) {
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const absolute = proxyUploadUrl(uploadUrl);
  const res = await fetch(absolute, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${token}`,
    },
    body: blob,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const url = data.url as string | undefined;
  if (!url) throw new Error("Upload succeeded but no storage key returned");
  const key = extractKeyFromProxyUrl(url);
  if (!key) throw new Error("Could not read storage key from upload response");
  return key;
}

export default function MusicUploadScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState(user?.name ?? "");
  const [album, setAlbum] = useState("");
  const [genre, setGenre] = useState("");
  const [audio, setAudio] = useState<{
    uri: string;
    name?: string | null;
    mimeType?: string;
    size?: number;
  } | null>(null);
  const [cover, setCover] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        if (d.title) setTitle(d.title);
        if (d.artist) setArtist(d.artist);
        if (d.album) setAlbum(d.album);
        if (d.genre) setGenre(d.genre);
      } catch {
        /* */
      }
    });
  }, []);

  useEffect(() => {
    const draft = { title, artist, album, genre };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
  }, [title, artist, album, genre]);

  const pickAudio = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: false,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setAudio({
        uri: a.uri,
        name: a.fileName,
        mimeType: a.mimeType,
        size: a.fileSize,
      });
    }
  };

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) setCover(res.assets[0]);
  };

  const upload = async () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    if (!audio || !title.trim() || !artist.trim()) {
      setError(t("music_uploadRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0.1);
    try {
      const audioType = audio.mimeType || "audio/mpeg";
      if (!audioType.startsWith("audio/") && !audioType.includes("mpeg") && !audioType.includes("mp3")) {
        // Allow common picker MIME quirks but reject clear non-audio images-only picks.
        if (audioType.startsWith("image/")) {
          throw new Error(t("music_uploadBadAudio"));
        }
      }
      const blobRes = await fetch(audio.uri);
      const blob = await blobRes.blob();
      const audioBytes = audio.size ?? blob.size;
      if (!audioBytes) throw new Error(t("music_uploadBadAudio"));
      setProgress(0.25);
      const sig = await requestMusicUploadSignature(
        {
          audio: {
            size: audioBytes,
            contentType: audioType.startsWith("audio/") ? audioType : "audio/mpeg",
            name: audio.name ?? undefined,
          },
          cover: cover
            ? {
                size: cover.fileSize ?? 0,
                contentType: cover.mimeType || "image/jpeg",
                name: cover.fileName ?? undefined,
              }
            : null,
        },
        { token },
      );
      setProgress(0.45);
      const storageKey = await putFile(
        audio.uri,
        sig.audio.uploadUrl,
        audioType.startsWith("audio/") ? audioType : "audio/mpeg",
        token,
      );
      setProgress(0.7);
      let coverStorageKey: string | undefined;
      if (cover && sig.cover) {
        coverStorageKey = await putFile(
          cover.uri,
          sig.cover.uploadUrl,
          cover.mimeType || "image/jpeg",
          token,
        );
      }
      setProgress(0.9);
      await registerMusicTrack(
        {
          title: title.trim(),
          artist: artist.trim(),
          album: album.trim() || undefined,
          genre: genre.trim() || undefined,
          type: "free",
          storageKey,
          coverStorageKey,
        },
        { token },
      );
      setProgress(1);
      await AsyncStorage.removeItem(DRAFT_KEY);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("music_uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MusicShell showNav>
      <ScrollView contentContainerStyle={styles.scroll}>
        {done ? (
          <View style={styles.success}>
            <Feather name="check-circle" size={40} color={musicTheme.orange} />
            <Text style={styles.successText}>{t("music_uploadSuccess")}</Text>
            <Pressable style={styles.btn} onPress={() => router.replace("/(tabs)/music")}>
              <Text style={styles.btnText}>{t("music_browse")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable style={styles.coverPick} onPress={() => void pickCover()}>
              {cover ? (
                <Image source={{ uri: cover.uri }} style={styles.coverImg} contentFit="cover" />
              ) : (
                <View style={styles.coverEmpty}>
                  <Feather name="plus" size={28} color={musicTheme.emerald} />
                  <Text style={styles.coverHint}>{t("music_addPhoto")}</Text>
                </View>
              )}
            </Pressable>

            <Pressable style={styles.pick} onPress={() => void pickAudio()}>
              <Feather name="music" size={22} color={musicTheme.orange} />
              <Text style={styles.pickText}>
                {audio ? audio.name || t("music_audioSelected") : t("music_chooseAudio")}
              </Text>
            </Pressable>

            <Text style={styles.label}>{t("music_fieldTitle")}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholderTextColor={musicTheme.muted}
              placeholder={t("music_fieldTitle")}
            />
            <Text style={styles.label}>{t("music_fieldArtist")}</Text>
            <TextInput
              style={styles.input}
              value={artist}
              onChangeText={setArtist}
              placeholderTextColor={musicTheme.muted}
              placeholder={t("music_fieldArtist")}
            />
            <Text style={styles.label}>{t("music_fieldAlbum")}</Text>
            <TextInput
              style={styles.input}
              value={album}
              onChangeText={setAlbum}
              placeholderTextColor={musicTheme.muted}
              placeholder={t("music_fieldAlbum")}
            />
            <Text style={styles.label}>{t("music_fieldGenre")}</Text>
            <TextInput
              style={styles.input}
              value={genre}
              onChangeText={setGenre}
              placeholderTextColor={musicTheme.muted}
              placeholder={t("music_fieldGenre")}
            />

            {busy ? (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.progressLabel}>{Math.round(progress * 100)}%</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.btn} onPress={() => void upload()} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={musicTheme.white} />
              ) : (
                <Text style={styles.btnText}>{error ? t("music_retry") : t("music_upload")}</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 140, gap: 8 },
  coverPick: {
    alignSelf: "center",
    width: 140,
    height: 140,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: musicTheme.border,
    backgroundColor: musicTheme.card,
  },
  coverImg: { width: "100%", height: "100%" },
  coverEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  coverHint: { color: musicTheme.muted, fontWeight: "700", fontSize: 12 },
  label: { color: musicTheme.muted, fontSize: 12, fontWeight: "700", marginTop: 8 },
  input: {
    backgroundColor: musicTheme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: musicTheme.border,
    color: musicTheme.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: musicTheme.secondary,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: musicTheme.border,
  },
  pickText: { color: musicTheme.text, fontWeight: "700", flex: 1 },
  progressWrap: { marginTop: 12, gap: 6 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: musicTheme.border,
    overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: musicTheme.orange },
  progressLabel: { color: musicTheme.muted, fontSize: 12, fontWeight: "700" },
  btn: {
    marginTop: 20,
    backgroundColor: musicTheme.orange,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: musicTheme.white, fontWeight: "800", fontSize: 16 },
  error: { color: musicTheme.danger, marginTop: 8 },
  success: { alignItems: "center", gap: 12, marginTop: 40 },
  successText: { color: musicTheme.text, fontWeight: "700", textAlign: "center" },
});
