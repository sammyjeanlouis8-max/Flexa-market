import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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
import {
  proxyUploadUrl,
  registerMusicTrack,
  requestMusicUploadSignature,
} from "@/lib/musicApi";
import { musicTheme } from "@/lib/musicTheme";

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
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState(user?.name ?? "");
  const [genre, setGenre] = useState("");
  const [audio, setAudio] = useState<{
    uri: string;
    name?: string | null;
    mimeType?: string;
    size?: number;
  } | null>(null);
  const [cover, setCover] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
      setError("Title, artist, and audio file are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const audioType = audio.mimeType || "audio/mpeg";
      const blobRes = await fetch(audio.uri);
      const blob = await blobRes.blob();
      const audioBytes = audio.size ?? blob.size;
      if (!audioBytes) throw new Error("Could not read audio file size");
      const sig = await requestMusicUploadSignature(
        {
          audio: {
            size: audioBytes,
            contentType: audioType,
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
      const storageKey = await putFile(audio.uri, sig.audio.uploadUrl, audioType, token);
      let coverStorageKey: string | undefined;
      if (cover && sig.cover) {
        coverStorageKey = await putFile(
          cover.uri,
          sig.cover.uploadUrl,
          cover.mimeType || "image/jpeg",
          token,
        );
      }
      await registerMusicTrack(
        {
          title: title.trim(),
          artist: artist.trim(),
          genre: genre.trim() || undefined,
          type: "free",
          storageKey,
          coverStorageKey,
        },
        { token },
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MusicShell title="Add music" showNav={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {done ? (
          <View style={styles.success}>
            <Feather name="check-circle" size={40} color={musicTheme.orange} />
            <Text style={styles.successText}>Track submitted for playback.</Text>
            <Pressable style={styles.btn} onPress={() => router.replace("/(tabs)/music")}>
              <Text style={styles.btnText}>Back to Music</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable style={styles.pick} onPress={() => void pickAudio()}>
              <Feather name="music" size={22} color={musicTheme.orange} />
              <Text style={styles.pickText}>
                {audio ? audio.name : "Choose audio file"}
              </Text>
            </Pressable>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={musicTheme.muted} placeholder="Track title" />
            <Text style={styles.label}>Artist</Text>
            <TextInput style={styles.input} value={artist} onChangeText={setArtist} placeholderTextColor={musicTheme.muted} placeholder="Artist name" />
            <Text style={styles.label}>Genre</Text>
            <TextInput style={styles.input} value={genre} onChangeText={setGenre} placeholderTextColor={musicTheme.muted} placeholder="Optional genre" />
            <Pressable style={styles.pick} onPress={() => void pickCover()}>
              <Feather name="image" size={22} color={musicTheme.orange} />
              <Text style={styles.pickText}>
                {cover ? "Cover selected" : "Choose cover art (optional)"}
              </Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.btn} onPress={() => void upload()} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={musicTheme.white} />
              ) : (
                <Text style={styles.btnText}>Upload</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 120, gap: 8 },
  label: { color: musicTheme.muted, fontSize: 12, fontWeight: "700", marginTop: 8 },
  input: {
    backgroundColor: musicTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: musicTheme.line,
    color: musicTheme.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: musicTheme.forest,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: musicTheme.line,
  },
  pickText: { color: musicTheme.white, fontWeight: "700", flex: 1 },
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
  successText: { color: musicTheme.white, fontWeight: "700", textAlign: "center" },
});