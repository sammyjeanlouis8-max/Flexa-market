/**
 * Local draft recovery for interrupted Flexa Music uploads (device-only).
 * Does not invent server draft endpoints.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flexa_music_upload_draft_v1";

export type MusicUploadDraft = {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  lyrics?: string;
  audioUri?: string | null;
  audioName?: string | null;
  audioMime?: string | null;
  audioSize?: number | null;
  coverUri?: string | null;
  coverMime?: string | null;
  coverSize?: number | null;
  updatedAt: string;
};

export async function loadMusicDraft(): Promise<MusicUploadDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MusicUploadDraft;
  } catch {
    return null;
  }
}

export async function saveMusicDraft(draft: Omit<MusicUploadDraft, "updatedAt">): Promise<void> {
  const payload: MusicUploadDraft = { ...draft, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export async function clearMusicDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
