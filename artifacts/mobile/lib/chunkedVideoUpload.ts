/**
 * Chunked Wasabi video upload — mirrors api-server 8 MiB chunk protocol.
 * Supports progress, cancellation, per-chunk retries, and resume via chunk-status.
 * Credentials never leave the server.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "./api";

export const VIDEO_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 300 * 1024 * 1024;
const SESSION_KEY = "flexa_video_upload_session_v1";
const CHUNK_RETRIES = 3;

export type ChunkUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
  chunkIndex: number;
  totalChunks: number;
};

export type VideoUploadSession = {
  uploadId: string;
  localUri: string;
  contentType: string;
  purpose: "listing" | "boost";
  totalBytes: number;
  totalChunks: number;
  receivedChunkIndices: number[];
  updatedAt: string;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function loadVideoUploadSession(): Promise<VideoUploadSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as VideoUploadSession) : null;
  } catch {
    return null;
  }
}

export async function saveVideoUploadSession(session: VideoUploadSession | null): Promise<void> {
  try {
    if (!session) await AsyncStorage.removeItem(SESSION_KEY);
    else {
      await AsyncStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...session, updatedAt: new Date().toISOString() }),
      );
    }
  } catch {
    /* ignore */
  }
}

async function putChunkBinary(
  url: string,
  body: ArrayBuffer,
  contentType: string,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Length", String(body.byteLength));
    if (signal) {
      const onAbort = () => {
        xhr.abort();
        reject(new Error("Upload cancelled"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.onload = () => {
      if (xhr.status === 204 || (xhr.status >= 200 && xhr.status < 300)) {
        resolve();
      } else {
        reject(new Error(`Chunk upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during chunk upload"));
    xhr.send(body);
  });
}

async function putChunkWithRetry(
  url: string,
  body: ArrayBuffer,
  contentType: string,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < CHUNK_RETRIES; attempt++) {
    try {
      await putChunkBinary(url, body, contentType, token, signal);
      return;
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err;
      if (err instanceof Error && /cancelled/i.test(err.message)) throw err;
      if (attempt < CHUNK_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Chunk upload failed");
}

async function fetchChunkStatus(
  uploadId: string,
  opts: AuthOpts,
): Promise<{
  status?: string;
  url?: string;
  objectPath?: string;
  receivedChunkIndices?: number[];
  receivedBytes?: number;
  totalChunks?: number;
  totalBytes?: number;
  error?: string;
}> {
  const res = await fetch(`${getApiBase()}/storage/uploads/chunk-status/${uploadId}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Status failed (${res.status})`);
  return data;
}

async function pollUntilComplete(
  uploadId: string,
  opts: AuthOpts,
): Promise<{ url: string }> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    if (opts.signal?.aborted) throw new Error("Upload cancelled");
    const data = await fetchChunkStatus(uploadId, opts);
    if (data.status === "complete" && (data.url || data.objectPath)) {
      let url = String(data.url || data.objectPath);
      if (url.startsWith("/")) url = `https://flexamarket.com${url}`;
      return { url };
    }
    if (data.status === "failed" || data.error) {
      throw new Error(data.error || "Video processing failed");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for video processing");
}

/**
 * Upload a local video URI with chunked Wasabi protocol.
 * When `resumeUploadId` matches a live server session, skips already-received chunks.
 */
export async function uploadChunkedVideo(
  localUri: string,
  opts: AuthOpts & {
    contentType?: string;
    purpose?: "listing" | "boost";
    resumeUploadId?: string | null;
    onProgress?: (p: ChunkUploadProgress) => void;
  },
): Promise<{ url: string; uploadId: string }> {
  const contentType = (opts.contentType || "video/mp4").split(";")[0].trim();
  if (!contentType.startsWith("video/")) {
    throw new Error("Only video uploads are supported");
  }

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const totalBytes = blob.size;
  if (!totalBytes) throw new Error("Could not read video file");
  if (totalBytes > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error("Video exceeds the 300 MB upload limit");
  }

  const totalChunks = Math.ceil(totalBytes / VIDEO_CHUNK_SIZE_BYTES);
  let uploadId = opts.resumeUploadId?.trim() || "";
  let already = new Set<number>();

  if (uploadId) {
    try {
      const status = await fetchChunkStatus(uploadId, opts);
      if (status.status === "complete" && (status.url || status.objectPath)) {
        let url = String(status.url || status.objectPath);
        if (url.startsWith("/")) url = `https://flexamarket.com${url}`;
        await saveVideoUploadSession(null);
        return { url, uploadId };
      }
      if (
        status.totalBytes === totalBytes &&
        status.totalChunks === totalChunks &&
        Array.isArray(status.receivedChunkIndices)
      ) {
        already = new Set(status.receivedChunkIndices.map(Number));
      } else {
        uploadId = ""; // metadata mismatch — start a new session
      }
    } catch {
      uploadId = "";
    }
  }

  if (!uploadId) {
    const initRes = await fetch(`${getApiBase()}/storage/uploads/chunk-init`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        totalChunks,
        totalBytes,
        contentType,
        purpose: opts.purpose ?? "listing",
      }),
      signal: opts.signal,
    });
    const initData = await readJson(initRes);
    if (!initRes.ok) {
      throw new Error(initData.error || `Chunk init failed (${initRes.status})`);
    }
    uploadId = String(initData.uploadId);
    if (!uploadId) throw new Error("No uploadId returned");
    already = new Set();
  }

  await saveVideoUploadSession({
    uploadId,
    localUri,
    contentType,
    purpose: opts.purpose ?? "listing",
    totalBytes,
    totalChunks,
    receivedChunkIndices: [...already],
    updatedAt: new Date().toISOString(),
  });

  let loaded = already.size * VIDEO_CHUNK_SIZE_BYTES;
  if (loaded > totalBytes) loaded = totalBytes;

  for (let index = 0; index < totalChunks; index++) {
    if (opts.signal?.aborted) throw new Error("Upload cancelled");
    if (already.has(index)) {
      opts.onProgress?.({
        loaded: Math.min((index + 1) * VIDEO_CHUNK_SIZE_BYTES, totalBytes),
        total: totalBytes,
        percent: Math.round(
          (Math.min((index + 1) * VIDEO_CHUNK_SIZE_BYTES, totalBytes) / totalBytes) * 100,
        ),
        chunkIndex: index,
        totalChunks,
      });
      continue;
    }
    const start = index * VIDEO_CHUNK_SIZE_BYTES;
    const end = Math.min(start + VIDEO_CHUNK_SIZE_BYTES, totalBytes);
    const chunkBlob = blob.slice(start, end);
    const buffer = await chunkBlob.arrayBuffer();
    const putUrl = `${getApiBase()}/storage/uploads/chunk/${uploadId}/${index}`;
    await putChunkWithRetry(putUrl, buffer, contentType, opts.token, opts.signal);
    already.add(index);
    loaded = end;
    await saveVideoUploadSession({
      uploadId,
      localUri,
      contentType,
      purpose: opts.purpose ?? "listing",
      totalBytes,
      totalChunks,
      receivedChunkIndices: [...already],
      updatedAt: new Date().toISOString(),
    });
    opts.onProgress?.({
      loaded,
      total: totalBytes,
      percent: Math.round((loaded / totalBytes) * 100),
      chunkIndex: index,
      totalChunks,
    });
  }

  const finRes = await fetch(`${getApiBase()}/storage/uploads/chunk-finalize/${uploadId}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: "{}",
    signal: opts.signal,
  });
  const finData = await readJson(finRes);
  if (!finRes.ok && finRes.status !== 202) {
    // Incomplete finalize may still list received chunks — keep session for resume.
    if (finRes.status === 409 && Array.isArray(finData.receivedChunkIndices)) {
      await saveVideoUploadSession({
        uploadId,
        localUri,
        contentType,
        purpose: opts.purpose ?? "listing",
        totalBytes,
        totalChunks,
        receivedChunkIndices: finData.receivedChunkIndices.map(Number),
        updatedAt: new Date().toISOString(),
      });
    }
    throw new Error(finData.error || `Finalize failed (${finRes.status})`);
  }
  if (finData.url || finData.objectPath) {
    let url = String(finData.url || finData.objectPath);
    if (url.startsWith("/")) url = `https://flexamarket.com${url}`;
    await saveVideoUploadSession(null);
    return { url, uploadId };
  }
  const done = await pollUntilComplete(uploadId, opts);
  await saveVideoUploadSession(null);
  return { url: done.url, uploadId };
}
