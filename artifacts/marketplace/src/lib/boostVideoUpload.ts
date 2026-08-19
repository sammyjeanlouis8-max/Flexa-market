const BOOST_VIDEO_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_BOOST_VIDEO_BYTES = 300 * 1024 * 1024;

type ProgressHandler = (percent: number) => void;

/**
 * Uploads a Boost video through the owner-bound server normalization pipeline.
 * Resolves only after Wasabi contains the H.264/AAC MP4 and returns its signed
 * one-day proof URL for the subsequent Boost create/update request.
 */
export async function uploadNormalizedBoostVideo(
  file: File,
  authToken?: string | null,
  onProgress?: ProgressHandler,
): Promise<string> {
  if (file.size < 1 || file.size > MAX_BOOST_VIDEO_BYTES) {
    throw new Error("boost-video-size-invalid");
  }

  const token = authToken || localStorage.getItem("flexamarket_token") || "";
  if (!token) throw new Error("boost-video-auth-required");
  const authHeaders = { Authorization: `Bearer ${token}` };
  const totalChunks = Math.ceil(file.size / BOOST_VIDEO_CHUNK_BYTES);
  const contentType = file.type || "video/mp4";

  const initResponse = await fetch("/api/storage/uploads/chunk-init", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      totalChunks,
      totalBytes: file.size,
      contentType,
    }),
  });
  if (!initResponse.ok) throw new Error(`chunk-init-failed-${initResponse.status}`);
  const { uploadId } = await initResponse.json() as { uploadId: string };

  for (let index = 0; index < totalChunks; index += 1) {
    const chunk = file.slice(
      index * BOOST_VIDEO_CHUNK_BYTES,
      (index + 1) * BOOST_VIDEO_CHUNK_BYTES,
    );
    const chunkResponse = await fetch(`/api/storage/uploads/chunk/${uploadId}/${index}`, {
      method: "PUT",
      headers: { "Content-Type": contentType, ...authHeaders },
      body: chunk,
    });
    if (!chunkResponse.ok) {
      throw new Error(`chunk-put-failed-${chunkResponse.status}-idx-${index}`);
    }
    onProgress?.(Math.round(((index + 1) / totalChunks) * 90));
  }

  const finalizeResponse = await fetch(`/api/storage/uploads/chunk-finalize/${uploadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: "{}",
  });
  if (!finalizeResponse.ok) {
    throw new Error(`chunk-finalize-failed-${finalizeResponse.status}`);
  }
  const finalized = await finalizeResponse.json() as { status?: string; url?: string };
  if (finalized.status === "complete" && finalized.url) {
    onProgress?.(100);
    return finalized.url;
  }

  for (let attempt = 0; attempt < 450; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const statusResponse = await fetch(`/api/storage/uploads/chunk-status/${uploadId}`, {
      headers: authHeaders,
    });
    if (!statusResponse.ok) {
      throw new Error(`chunk-status-failed-${statusResponse.status}`);
    }
    const status = await statusResponse.json() as {
      status?: string;
      url?: string;
      error?: string;
    };
    if (status.status === "complete" && status.url) {
      onProgress?.(100);
      return status.url;
    }
    if (status.status === "failed") {
      throw new Error(status.error || "video-normalization-failed");
    }
    onProgress?.(Math.min(99, 90 + Math.floor(attempt / 50)));
  }

  throw new Error("video-normalization-timeout");
}