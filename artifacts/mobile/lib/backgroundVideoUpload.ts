/**
 * Android durable video upload via FlexaBackgroundUpload (WorkManager +
 * FOREGROUND_SERVICE_DATA_SYNC). Falls back to in-process chunk PUTs when the
 * native module is unavailable (iOS / Expo Go).
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { getApiBase } from "./api";
import { apiRequest } from "./request";
import {
  dispatchFlexaUpload,
  hasNativeBackgroundUploads,
} from "@/native/backgroundUploads";

/** Must match server CHUNK_SIZE_BYTES and UploadStore.UPLOAD_CHUNK_BYTES. */
export const VIDEO_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * Upload API root (`.../storage/uploads`). Production defaults to flexamarket.com.
 * Set EXPO_PUBLIC_UPLOAD_API_BASE for emulator QA against a local mock when
 * Wasabi/production storage is unavailable.
 */
export function getUploadApiBase(): string {
  const override = String(process.env.EXPO_PUBLIC_UPLOAD_API_BASE || "")
    .trim()
    .replace(/\/$/, "");
  if (override) return override;
  return `${getApiBase()}/storage/uploads`;
}

export type BackgroundVideoUploadProgress = {
  percent: number;
  phase: "staging" | "uploading" | "processing";
};

function newId(): string {
  // crypto.randomUUID is available in modern Hermes / RN.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.status === "granted") return;
    await Notifications.requestPermissionsAsync();
  } catch {
    /* Upload still proceeds; FGS may be silent without permission. */
  }
}

async function uploadJson<T>(
  path: string,
  opts: { token: string; method?: string; body?: unknown },
): Promise<T> {
  const base = getUploadApiBase();
  // Production uses the shared apiRequest helper (same host as the rest of the app).
  if (base === `${getApiBase()}/storage/uploads`) {
    return apiRequest<T>(`/storage/uploads${path}`, {
      token: opts.token,
      method: opts.method,
      body: opts.body,
    });
  }
  const res = await fetch(`${base}${path}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);
  if (!res.ok) {
    throw new Error(
      typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : `Upload API ${res.status}`,
    );
  }
  return data;
}

async function waitForProcessedUrl(
  uploadId: string,
  token: string,
  onProgress?: (p: BackgroundVideoUploadProgress) => void,
): Promise<string> {
  for (let i = 0; i < 120; i += 1) {
    const status = await uploadJson<{ status?: string; url?: string; error?: string }>(
      `/chunk-status/${uploadId}`,
      { token },
    );
    onProgress?.({
      percent: Math.min(99, 90 + Math.floor(i / 4)),
      phase: "processing",
    });
    if (status.status === "complete" && status.url) return status.url;
    if (status.status === "failed") {
      throw new Error(status.error || "Video processing failed");
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Video processing timed out. Your upload is saved — try again to check status.");
}

async function uploadWithNativeModule(
  localUri: string,
  opts: {
    token: string;
    contentType: string;
    fileName: string;
    totalBytes: number;
    purpose: "boost" | "listing";
    onProgress?: (p: BackgroundVideoUploadProgress) => void;
  },
): Promise<string> {
  await ensureNotificationPermission();
  const totalChunks = Math.ceil(opts.totalBytes / VIDEO_UPLOAD_CHUNK_BYTES);
  const init = await uploadJson<{ uploadId: string }>("/chunk-init", {
    token: opts.token,
    method: "POST",
    body: {
      totalChunks,
      totalBytes: opts.totalBytes,
      contentType: opts.contentType,
      purpose: opts.purpose,
    },
  });
  const uploadId = init.uploadId;
  const jobId = newId();
  const apiBase = getUploadApiBase();

  opts.onProgress?.({ percent: 2, phase: "staging" });
  await dispatchFlexaUpload({
    type: "flexa-upload",
    requestId: newId(),
    action: "begin",
    jobId,
    fileName: opts.fileName,
    totalBytes: opts.totalBytes,
    contentType: opts.contentType,
    uploadId,
    chunkSize: VIDEO_UPLOAD_CHUNK_BYTES,
    totalChunks,
    apiBase,
    token: opts.token,
  });

  opts.onProgress?.({ percent: 5, phase: "staging" });
  await dispatchFlexaUpload({
    type: "flexa-upload",
    requestId: newId(),
    action: "stageFromUri",
    jobId,
    uri: localUri,
  });

  opts.onProgress?.({ percent: 8, phase: "uploading" });
  await dispatchFlexaUpload({
    type: "flexa-upload",
    requestId: newId(),
    action: "start",
    jobId,
  });

  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const native = await dispatchFlexaUpload({
      type: "flexa-upload",
      requestId: newId(),
      action: "status",
      jobId,
    });
    const state = String(native.state ?? "");
    const bytesSent = Number(native.bytesSent ?? 0);
    if (opts.totalBytes > 0) {
      opts.onProgress?.({
        percent: Math.min(90, Math.round((bytesSent / opts.totalBytes) * 90)),
        phase: "uploading",
      });
    }
    if (state === "complete") break;
    if (state === "failed" || state === "cancelled") {
      throw new Error(
        typeof native.error === "string" && native.error
          ? native.error
          : "Background upload stopped. Try again.",
      );
    }
  }

  const url = await waitForProcessedUrl(uploadId, opts.token, opts.onProgress);
  opts.onProgress?.({ percent: 100, phase: "processing" });
  return url;
}

async function uploadInProcess(
  localUri: string,
  opts: {
    token: string;
    contentType: string;
    totalBytes: number;
    purpose: "boost" | "listing";
    onProgress?: (p: BackgroundVideoUploadProgress) => void;
  },
): Promise<string> {
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const totalBytes = blob.size || opts.totalBytes;
  const totalChunks = Math.ceil(totalBytes / VIDEO_UPLOAD_CHUNK_BYTES);
  const init = await uploadJson<{ uploadId: string }>("/chunk-init", {
    token: opts.token,
    method: "POST",
    body: {
      totalChunks,
      totalBytes,
      contentType: opts.contentType,
      purpose: opts.purpose,
    },
  });
  const uploadId = init.uploadId;
  const uploadBase = getUploadApiBase();
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * VIDEO_UPLOAD_CHUNK_BYTES;
    const chunk = blob.slice(start, start + VIDEO_UPLOAD_CHUNK_BYTES);
    const buf = await chunk.arrayBuffer();
    const res = await fetch(`${uploadBase}/chunk/${uploadId}/${index}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/octet-stream",
      },
      body: buf,
    });
    if (!res.ok) throw new Error(`Chunk ${index + 1} upload failed`);
    opts.onProgress?.({
      percent: Math.round(((index + 1) / totalChunks) * 90),
      phase: "uploading",
    });
  }
  await uploadJson(`/chunk-finalize/${uploadId}`, {
    token: opts.token,
    method: "POST",
    body: {},
  });
  const url = await waitForProcessedUrl(uploadId, opts.token, opts.onProgress);
  opts.onProgress?.({ percent: 100, phase: "processing" });
  return url;
}

/**
 * Upload a local video URI. On Android production builds this starts a
 * dataSync foreground service with the Play-declared notification copy.
 */
export async function uploadBoostVideo(
  localUri: string,
  opts: {
    token: string;
    contentType?: string;
    fileName?: string;
    purpose?: "boost" | "listing";
    knownBytes?: number;
    onProgress?: (p: BackgroundVideoUploadProgress) => void;
  },
): Promise<string> {
  const contentType = (opts.contentType || "video/mp4").split(";")[0].trim().toLowerCase() || "video/mp4";
  const fileName = opts.fileName || `boost-${Date.now()}.mp4`;
  const purpose = opts.purpose || "boost";

  // Prefer picker-reported size / FileSystem metadata so we do not load a
  // multi‑MB video into JS memory before native staging.
  let totalBytes =
    typeof opts.knownBytes === "number" && opts.knownBytes > 0 ? opts.knownBytes : 0;
  if (totalBytes < 1) {
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists && typeof (info as { size?: number }).size === "number") {
        totalBytes = (info as { size: number }).size;
      }
    } catch {
      /* fall through to blob probe */
    }
  }
  if (totalBytes < 1) {
    const probe = await fetch(localUri);
    const blob = await probe.blob();
    totalBytes = blob.size;
  }
  if (totalBytes < 1 || totalBytes > 200 * 1024 * 1024) {
    throw new Error("Video size is invalid.");
  }
  if (!contentType.startsWith("video/")) {
    throw new Error("This video type is not supported. Try MP4 or MOV.");
  }

  if (hasNativeBackgroundUploads) {
    return uploadWithNativeModule(localUri, {
      token: opts.token,
      contentType,
      fileName,
      totalBytes,
      purpose,
      onProgress: opts.onProgress,
    });
  }

  return uploadInProcess(localUri, {
    token: opts.token,
    contentType,
    totalBytes,
    purpose,
    onProgress: opts.onProgress,
  });
}
