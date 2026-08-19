const BOOST_VIDEO_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_BOOST_VIDEO_BYTES = 300 * 1024 * 1024;

type ProgressHandler = (percent: number) => void;

interface UploadErrorBody {
  errorCode?: string;
  error?: string;
  retryable?: boolean;
}

export class BoostVideoUploadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "BoostVideoUploadError";
  }
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function inferVideoContentType(file: File): string {
  const declared = file.type.split(";")[0].trim().toLowerCase();
  if (declared.startsWith("video/")) return declared;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mov" || extension === "qt") return "video/quicktime";
  if (extension === "m4v") return "video/x-m4v";
  if (extension === "webm") return "video/webm";
  if (extension === "3gp") return "video/3gpp";
  return "video/mp4";
}

async function responseError(
  response: Response,
  fallbackCode: string,
  fallbackMessage: string,
): Promise<BoostVideoUploadError> {
  let body: UploadErrorBody = {};
  try {
    body = await response.json() as UploadErrorBody;
  } catch {
    // An upstream proxy may return an empty or non-JSON error body.
  }
  return new BoostVideoUploadError(
    body.errorCode || fallbackCode,
    body.error || fallbackMessage,
    response.status,
    body.retryable === true,
  );
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (
        response.ok ||
        (response.status < 500 && response.status !== 429) ||
        attempt === attempts - 1
      ) {
        return response;
      }
    } catch (error) {
      lastNetworkError = error;
      if (attempt === attempts - 1) break;
    }
    await sleep(500 * (attempt + 1));
  }
  throw new BoostVideoUploadError(
    "UPLOAD_NETWORK_ERROR",
    lastNetworkError instanceof Error ? lastNetworkError.message : "Network request failed",
    undefined,
    true,
  );
}

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
    throw new BoostVideoUploadError("UPLOAD_SIZE_INVALID", "Video size is invalid.");
  }

  const token = authToken || localStorage.getItem("flexamarket_token") || "";
  if (!token) throw new BoostVideoUploadError("UPLOAD_AUTH_REQUIRED", "Sign in before uploading a video.");
  const authHeaders = { Authorization: `Bearer ${token}` };
  const totalChunks = Math.ceil(file.size / BOOST_VIDEO_CHUNK_BYTES);
  const contentType = inferVideoContentType(file);

  const initResponse = await fetchWithRetry("/api/storage/uploads/chunk-init", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      totalChunks,
      totalBytes: file.size,
      contentType,
    }),
  });
  if (!initResponse.ok) {
    throw await responseError(initResponse, "UPLOAD_SESSION_CREATE_FAILED", "Video upload could not start.");
  }
  const { uploadId } = await initResponse.json() as { uploadId: string };
  if (!uploadId) {
    throw new BoostVideoUploadError("UPLOAD_SESSION_CREATE_FAILED", "Video upload did not return a session.");
  }

  for (let index = 0; index < totalChunks; index += 1) {
    const chunk = file.slice(
      index * BOOST_VIDEO_CHUNK_BYTES,
      (index + 1) * BOOST_VIDEO_CHUNK_BYTES,
    );
    const chunkResponse = await fetchWithRetry(`/api/storage/uploads/chunk/${uploadId}/${index}`, {
      method: "PUT",
      headers: { "Content-Type": contentType, ...authHeaders },
      body: chunk,
    });
    if (!chunkResponse.ok) {
      throw await responseError(chunkResponse, "CHUNK_UPLOAD_FAILED", `Video chunk ${index + 1} could not be uploaded.`);
    }
    onProgress?.(Math.round(((index + 1) / totalChunks) * 90));
  }

  const finalize = () => fetchWithRetry(`/api/storage/uploads/chunk-finalize/${uploadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: "{}",
  });
  const finalizeResponse = await finalize();
  if (!finalizeResponse.ok) {
    throw await responseError(finalizeResponse, "VIDEO_FINALIZE_FAILED", "Video processing could not start.");
  }
  const finalized = await finalizeResponse.json() as { status?: string; url?: string };
  if (finalized.status === "complete" && finalized.url) {
    onProgress?.(100);
    return finalized.url;
  }

  let processingRetryUsed = false;
  let consecutiveStatusFailures = 0;
  for (let attempt = 0; attempt < 900; attempt += 1) {
    await sleep(2_000);
    const statusResponse = await fetchWithRetry(`/api/storage/uploads/chunk-status/${uploadId}`, {
      headers: authHeaders,
    }, 2);
    if (!statusResponse.ok) {
      consecutiveStatusFailures += 1;
      if (statusResponse.status >= 500 && consecutiveStatusFailures < 5) continue;
      throw await responseError(statusResponse, "UPLOAD_STATUS_UNAVAILABLE", "Video status is unavailable.");
    }
    consecutiveStatusFailures = 0;
    const status = await statusResponse.json() as {
      status?: string;
      url?: string;
      errorCode?: string;
      error?: string;
      retryable?: boolean;
    };
    if (status.status === "complete" && status.url) {
      onProgress?.(100);
      return status.url;
    }
    if (status.status === "failed") {
      if (status.retryable && !processingRetryUsed) {
        processingRetryUsed = true;
        const retryResponse = await finalize();
        if (!retryResponse.ok) {
          throw await responseError(retryResponse, status.errorCode || "VIDEO_PROCESSING_FAILED", status.error || "Video processing failed.");
        }
        continue;
      }
      throw new BoostVideoUploadError(
        status.errorCode || "VIDEO_PROCESSING_FAILED",
        status.error || "Video processing failed.",
        undefined,
        status.retryable === true,
      );
    }
    onProgress?.(Math.min(99, 90 + Math.floor(attempt / 50)));
  }

  throw new BoostVideoUploadError(
    "VIDEO_PROCESSING_TIMEOUT",
    "Video processing took too long. The uploaded chunks are safe; please retry.",
    undefined,
    true,
  );
}