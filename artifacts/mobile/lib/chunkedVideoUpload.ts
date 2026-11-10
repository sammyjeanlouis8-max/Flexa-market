/**
 * Chunked Wasabi video upload — mirrors api-server 8 MiB chunk protocol.
 * Credentials never leave the server; client uses auth + put-proxy chunks.
 */
import { getApiBase } from "./api";

export const VIDEO_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 300 * 1024 * 1024;

export type ChunkUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
  chunkIndex: number;
  totalChunks: number;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
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

async function pollUntilComplete(
  uploadId: string,
  opts: AuthOpts,
): Promise<{ url: string }> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    if (opts.signal?.aborted) throw new Error("Upload cancelled");
    const res = await fetch(`${getApiBase()}/storage/uploads/chunk-status/${uploadId}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${opts.token}`,
      },
      signal: opts.signal,
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || `Status failed (${res.status})`);
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
 */
export async function uploadChunkedVideo(
  localUri: string,
  opts: AuthOpts & {
    contentType?: string;
    purpose?: "listing" | "boost";
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
  const uploadId = String(initData.uploadId);
  if (!uploadId) throw new Error("No uploadId returned");

  let loaded = 0;
  for (let index = 0; index < totalChunks; index++) {
    if (opts.signal?.aborted) throw new Error("Upload cancelled");
    const start = index * VIDEO_CHUNK_SIZE_BYTES;
    const end = Math.min(start + VIDEO_CHUNK_SIZE_BYTES, totalBytes);
    const chunkBlob = blob.slice(start, end);
    const buffer = await chunkBlob.arrayBuffer();
    const putUrl = `${getApiBase()}/storage/uploads/chunk/${uploadId}/${index}`;
    await putChunkBinary(putUrl, buffer, contentType, opts.token, opts.signal);
    loaded = end;
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
    throw new Error(finData.error || `Finalize failed (${finRes.status})`);
  }
  if (finData.url || finData.objectPath) {
    let url = String(finData.url || finData.objectPath);
    if (url.startsWith("/")) url = `https://flexamarket.com${url}`;
    return { url, uploadId };
  }
  const done = await pollUntilComplete(uploadId, opts);
  return { url: done.url, uploadId };
}
