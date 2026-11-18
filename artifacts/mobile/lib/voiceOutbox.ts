/**
 * Persistent voice-message outbox for native chat.
 * Recordings are saved to the document directory and indexed in AsyncStorage
 * so a kill / offline gap can resume the same clientMessageId.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export type VoiceOutboxStatus =
  | "queued"
  | "waiting_connection"
  | "uploading"
  | "sending"
  | "failed";

export type VoiceOutboxItem = {
  /** Stable client id — reused on every retry for server idempotency. */
  id: string;
  conversationId: number;
  localUri: string;
  mimeType: string;
  fileName: string;
  mediaUrl?: string;
  createdAt: number;
  attempts: number;
  status: VoiceOutboxStatus;
  lastError?: string;
};

const INDEX_KEY = "flexa.chat.voiceOutbox.v1";

function newId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readIndex(): Promise<VoiceOutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VoiceOutboxItem[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(items: VoiceOutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(items));
}

function outboxDir(): string {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  return `${base}flexa-voice-outbox/`;
}

async function ensureDir(): Promise<string> {
  const dir = outboxDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function listVoiceOutbox(conversationId?: number): Promise<VoiceOutboxItem[]> {
  const all = await readIndex();
  const filtered =
    conversationId == null ? all : all.filter((item) => item.conversationId === conversationId);
  return filtered.sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueueVoiceRecording(input: {
  conversationId: number;
  sourceUri: string;
  mimeType?: string;
}): Promise<VoiceOutboxItem> {
  const dir = await ensureDir();
  const id = newId();
  const mimeType = (input.mimeType || "audio/mp4").split(";")[0].trim() || "audio/mp4";
  const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mpeg") ? "mp3" : "m4a";
  const fileName = `${id}.${ext}`;
  const dest = `${dir}${fileName}`;
  await FileSystem.copyAsync({ from: input.sourceUri, to: dest });

  const item: VoiceOutboxItem = {
    id,
    conversationId: input.conversationId,
    localUri: dest,
    mimeType: mimeType === "audio/m4a" ? "audio/mp4" : mimeType,
    fileName,
    createdAt: Date.now(),
    attempts: 0,
    status: "queued",
  };
  const all = await readIndex();
  all.push(item);
  await writeIndex(all);
  return item;
}

export async function updateVoiceOutbox(
  id: string,
  patch: Partial<
    Pick<VoiceOutboxItem, "mediaUrl" | "attempts" | "status" | "lastError" | "mimeType">
  >,
): Promise<VoiceOutboxItem | null> {
  const all = await readIndex();
  const idx = all.findIndex((item) => item.id === id);
  if (idx < 0) return null;
  const next = { ...all[idx], ...patch };
  all[idx] = next;
  await writeIndex(all);
  return next;
}

export async function removeVoiceOutbox(id: string): Promise<void> {
  const all = await readIndex();
  const item = all.find((row) => row.id === id);
  const next = all.filter((row) => row.id !== id);
  await writeIndex(next);
  if (item?.localUri) {
    try {
      await FileSystem.deleteAsync(item.localUri, { idempotent: true });
    } catch {
      /* ignore missing file */
    }
  }
}
