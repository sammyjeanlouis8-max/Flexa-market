import { BoostVideoUploadError, MAX_BOOST_VIDEO_BYTES } from "./boostVideoUpload";
import { hasNativeVideoUpload, nativeUploadRequest, stageNativeVideo } from "./nativeVideoUpload";
import { loadVideoFile, loadVideoJobs, removeVideoFile, removeVideoJob, saveNewVideoJob, saveVideoJob } from "./videoUploadStorage";

export type VideoUploadPurpose = "boost" | "listing";
export interface VideoUploadJob {
  id: string;
  ownerId: number;
  purpose: VideoUploadPurpose;
  fileName: string;
  totalBytes: number;
  progress: number;
  state: "preparing" | "uploading" | "processing" | "paused" | "complete" | "failed" | "cancelled";
  url?: string;
  error?: string;
  native: boolean;
  updatedAt: number;
}
interface StoredJob extends VideoUploadJob {
  contentType: string;
  uploadId?: string;
  nativeStarted?: boolean;
}
interface ServerStatus {
  status: string;
  receivedChunkIndices?: number[];
  receivedBytes?: number;
  totalChunks?: number;
  url?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
}
const CHUNK_BYTES = 8 * 1024 * 1024;
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/storage/uploads`;
const listeners = new Set<() => void>();
const jobs = new Map<string, StoredJob>();
const active = new Map<string, AbortController>();
const waiters = new Map<string, { resolve(url: string): void; reject(error: unknown): void }>();
let identity: { ownerId: number; token: string } | null = null;
let snapshot: readonly VideoUploadJob[] = [];
let generation = 0;
let initialized = false;
let booting = false;

export const getVideoUploads = () => snapshot;
export function subscribeVideoUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emit() {
  snapshot = [...jobs.values()].filter((job) => job.ownerId === identity?.ownerId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((job) => ({ ...job }));
  listeners.forEach((listener) => listener());
}
async function update(job: StoredJob, changes: Partial<StoredJob>) {
  Object.assign(job, changes, { updatedAt: Date.now() });
  await saveVideoJob(job);
  emit();
}
function progress(job: StoredJob, percent: number) {
  job.progress = Math.max(0, Math.min(99, percent));
  emit();
}
const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
  const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
  signal.addEventListener("abort", abort, { once: true });
});

async function request(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 120_000);
    try {
      const response = await fetch(`${API}/${path}`, { ...init, signal: controller.signal });
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (response.ok) return response;
      const body = await response.json().catch(() => ({}));
      const retryable = response.status >= 500 || response.status === 429 || body.retryable === true;
      const error = new BoostVideoUploadError(body.errorCode ?? "VIDEO_UPLOAD_FAILED",
        body.error ?? "Video upload failed. Try again.", response.status, retryable);
      if (!retryable || attempt === 3) throw error;
      lastError = error;
    } catch (error) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (error instanceof BoostVideoUploadError && (!error.retryable || attempt === 3)) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
    if (attempt < 3) await delay(Math.min(15_000, 1000 * 2 ** attempt) + Math.random() * 400, signal);
  }
  throw lastError ?? new Error("Connection interrupted. Try again.");
}
function auth(job: StoredJob) {
  if (!identity || identity.ownerId !== job.ownerId) {
    throw new BoostVideoUploadError("UPLOAD_AUTH_REQUIRED", "Sign in to resume this upload.", 401);
  }
  return { Authorization: `Bearer ${identity.token}` };
}
async function status(job: StoredJob, signal: AbortSignal): Promise<ServerStatus> {
  const result = await (await request(`chunk-status/${job.uploadId}`, { headers: auth(job) }, signal)).json();
  assertCurrentRun(job, signal);
  return result;
}
function assertCurrentRun(job: StoredJob, signal: AbortSignal) {
  if (signal.aborted || job.ownerId !== identity?.ownerId) throw new DOMException("Aborted", "AbortError");
}
async function complete(job: StoredJob, url: string, signal: AbortSignal) {
  assertCurrentRun(job, signal);
  await update(job, { state: "complete", progress: 100, url, error: undefined });
  assertCurrentRun(job, signal);
  // The server now owns the durable final asset; release the large local file.
  await removeVideoFile(job.id).catch(() => {});
  waiters.get(job.id)?.resolve(url);
  waiters.delete(job.id);
}
async function execute(job: StoredJob, signal: AbortSignal) {
  const file = await loadVideoFile(job.id);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (!job.uploadId) {
    if (!file) throw new Error("The saved video is unavailable. Select the original file again.");
    const response = await request("chunk-init", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(job) },
      body: JSON.stringify({ totalChunks: Math.ceil(job.totalBytes / CHUNK_BYTES), totalBytes: job.totalBytes, contentType: job.contentType }),
    }, signal);
    const session = await response.json();
    assertCurrentRun(job, signal);
    if (typeof session.uploadId !== "string") throw new Error("The upload session is invalid. Try again.");
    await update(job, { uploadId: session.uploadId, error: undefined });
  }
  let current = await status(job, signal);
  if (current.status === "complete" && current.url) { await complete(job, current.url, signal); return; }
  if (current.status !== "processing") {
    if (!file && !job.nativeStarted) throw new Error("Select the original video again to resume.");
    if (hasNativeVideoUpload()) {
      if (!job.nativeStarted) {
        if (!file) throw new Error("The saved video is unavailable. Select it again.");
        await update(job, { state: "preparing", native: true, error: undefined });
        await stageNativeVideo(file, {
          jobId: job.id, fileName: job.fileName, totalBytes: job.totalBytes,
          contentType: job.contentType, uploadId: job.uploadId, chunkSize: CHUNK_BYTES,
          totalChunks: Math.ceil(job.totalBytes / CHUNK_BYTES),
          apiBase: new URL(API, window.location.origin).href,
          token: identity!.token,
        }, signal, (p) => progress(job, Math.round(p / 10)));
        await update(job, { nativeStarted: true, state: "uploading", progress: 0 });
      } else {
        // Refresh the protected native credential when the user resumes.
        await nativeUploadRequest("begin", {
          jobId: job.id, fileName: job.fileName, totalBytes: job.totalBytes,
          contentType: job.contentType, uploadId: job.uploadId, chunkSize: CHUNK_BYTES,
          totalChunks: Math.ceil(job.totalBytes / CHUNK_BYTES),
          apiBase: new URL(API, window.location.origin).href, token: identity!.token,
        }, signal);
        await nativeUploadRequest("start", { jobId: job.id }, signal);
      }
      for (;;) {
        await delay(2000, signal);
        const native = await nativeUploadRequest<{ state: string; bytesSent: number; error?: string }>("status", { jobId: job.id }, signal);
        progress(job, Math.round(native.bytesSent / job.totalBytes * 90));
        if (native.state === "complete") break;
        if (native.state === "failed" || native.state === "cancelled") {
          await update(job, { nativeStarted: false });
          throw new Error(native.error || "Background upload stopped. Try again.");
        }
        // A successful server status is authoritative even if OS cleanup ran.
        current = await status(job, signal);
        if (current.status === "complete" && current.url) { await complete(job, current.url, signal); return; }
        if (current.status === "processing") break;
      }
    } else {
      if (!file) throw new Error("Select the original video again to resume.");
      await update(job, { state: "uploading", native: false, error: undefined });
      const confirmed = new Set(current.receivedChunkIndices ?? []);
      const total = Math.ceil(job.totalBytes / CHUNK_BYTES);
      const remaining = Array.from({ length: total }, (_, i) => i).filter((i) => !confirmed.has(i));
      let next = 0;
      let confirmedBytes = [...confirmed].reduce((sum, i) => sum + Math.min(CHUNK_BYTES, job.totalBytes - i * CHUNK_BYTES), 0);
      progress(job, Math.round(confirmedBytes / job.totalBytes * 90));
      // Two transfers improve throughput without flooding a mobile connection.
      await Promise.all(Array.from({ length: Math.min(2, remaining.length) }, async () => {
        while (next < remaining.length) {
          const index = remaining[next++];
          const chunk = file.slice(index * CHUNK_BYTES, Math.min((index + 1) * CHUNK_BYTES, file.size));
          await request(`chunk/${job.uploadId}/${index}`, {
            method: "PUT", headers: { "Content-Type": "application/octet-stream", ...auth(job) }, body: chunk,
          }, signal);
          confirmedBytes += chunk.size;
          progress(job, Math.round(confirmedBytes / job.totalBytes * 90));
        }
      }));
    }
    await request(`chunk-finalize/${job.uploadId}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...auth(job) }, body: "{}",
    }, signal);
  }
  await update(job, { state: "processing", progress: 90, error: undefined });
  for (let attempt = 0; attempt < 720; attempt++) {
    current = await status(job, signal);
    if (current.status === "complete" && current.url) { await complete(job, current.url, signal); return; }
    if (current.status === "failed") throw new BoostVideoUploadError(current.errorCode ?? "VIDEO_CONVERSION_FAILED",
      current.error ?? "Video processing failed. Try again.", undefined, current.retryable);
    await delay(2500, signal);
  }
  throw new Error("Processing is taking longer than expected. Your upload is saved. Try again to check its status.");
}

function run(job: StoredJob) {
  if (active.has(job.id) || job.ownerId !== identity?.ownerId || !identity.token) return;
  // One file at a time keeps foreground preparation and disk use bounded.
  if ([...active.keys()].some((id) => jobs.get(id)?.ownerId === job.ownerId)) return;
  const controller = new AbortController();
  active.set(job.id, controller);
  const perform = async () => {
    try {
      if (navigator.locks) {
        await navigator.locks.request(`flexa-video-${job.id}`, { signal: controller.signal }, async () => {
          const latest = (await loadVideoJobs<StoredJob>()).find((j) => j.id === job.id);
          if (latest) Object.assign(job, latest);
          assertCurrentRun(job, controller.signal);
          if (job.state === "complete" && job.url) { await complete(job, job.url, controller.signal); return; }
          await execute(job, controller.signal);
        });
      } else await execute(job, controller.signal);
    } catch (error) {
      if (job.state !== "cancelled") {
        const message = error instanceof Error ? error.message : "Upload interrupted. Try again.";
        const state = error instanceof BoostVideoUploadError && !error.retryable && error.status !== 401 ? "failed" : "paused";
        await update(job, { state, error: controller.signal.aborted ? "Upload paused. Sign in to resume." : message }).catch(() => {});
      }
      waiters.get(job.id)?.reject(error);
      waiters.delete(job.id);
    } finally {
      controller.abort();
      active.delete(job.id);
      emit();
      for (const pending of jobs.values()) {
        if (pending.ownerId === identity?.ownerId && ["preparing", "uploading", "processing"].includes(pending.state)) {
          run(pending);
          break;
        }
      }
    }
  };
  void perform();
}

export function setVideoUploadIdentity(ownerId: number | null, token: string | null) {
  if (identity?.ownerId === ownerId && identity?.token === token) return;
  const previous = identity;
  identity = ownerId && token ? { ownerId, token } : null;
  const version = ++generation;
  if (previous?.ownerId !== identity?.ownerId) {
    for (const [id, controller] of active) {
      controller.abort();
      const job = jobs.get(id);
      if (job?.native && hasNativeVideoUpload()) {
        void nativeUploadRequest("cancel", { jobId: id }).catch(() => {});
        job.nativeStarted = false;
      }
    }
  }
  emit();
  if (!identity) return;
  booting = true;
  void loadVideoJobs<StoredJob>().then((saved) => {
    if (version !== generation) return;
    for (const job of saved) if (!active.has(job.id)) jobs.set(job.id, job);
    initialized = true;
    booting = false;
    emit();
    for (const job of jobs.values()) {
      if (job.ownerId === identity?.ownerId && ["preparing", "uploading", "processing", "paused"].includes(job.state)) {
        if (job.state === "paused") job.state = "preparing";
        run(job);
      } else if (job.ownerId === identity?.ownerId && job.state === "complete" && job.uploadId) {
        // Refresh the owner-bound attachment proof without uploading bytes again.
        const controller = new AbortController();
        void status(job, controller.signal).then(async (result) => {
          if (result.url && version === generation) await update(job, { url: result.url });
        }).catch(() => {});
      }
    }
  }).catch((error) => {
    booting = false;
    console.error("[video-upload] Cannot restore saved uploads", error instanceof Error ? error.message : "Storage unavailable");
  });
}

export async function startVideoUpload(file: File, token: string | null | undefined, options: {
  ownerId: number;
  purpose: VideoUploadPurpose;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  if (!token || !Number.isSafeInteger(options.ownerId) || options.ownerId < 1) throw new BoostVideoUploadError("UPLOAD_AUTH_REQUIRED", "Sign in before uploading a video.");
  if (file.size < 1 || file.size > MAX_BOOST_VIDEO_BYTES) throw new BoostVideoUploadError("UPLOAD_SIZE_INVALID", "Video must be between 1 byte and 300 MB.");
  if (identity?.ownerId !== options.ownerId || identity.token !== token) setVideoUploadIdentity(options.ownerId, token);
  if (!initialized && !booting) throw new Error("Upload storage is unavailable. Try again.");
  const pending = [...jobs.values()].filter((j) => j.ownerId === options.ownerId && !["complete", "cancelled"].includes(j.state));
  if (pending.length >= 3) throw new Error("Finish or remove an existing upload before adding another video.");
  const declared = file.type.split(";")[0].toLowerCase();
  const contentType = declared.startsWith("video/") ? declared : /\.mov$/i.test(file.name) ? "video/quicktime" : "video/mp4";
  const job: StoredJob = { id: crypto.randomUUID(), ownerId: options.ownerId, purpose: options.purpose,
    fileName: file.name, totalBytes: file.size, progress: 0, state: "preparing",
    native: hasNativeVideoUpload(), contentType, updatedAt: Date.now() };
  const startGeneration = generation;
  try {
    await saveNewVideoJob(job, file);
  } catch {
    throw new Error("Not enough device storage to save this upload safely. Free some space and try again.");
  }
  if (generation !== startGeneration || identity?.ownerId !== options.ownerId) {
    await update(job, { state: "paused", error: "Sign in to resume this upload." });
    throw new BoostVideoUploadError("UPLOAD_AUTH_REQUIRED", "Sign in to resume this upload.", 401);
  }
  // Persistence is optional to the browser; IDB write success is mandatory.
  void navigator.storage?.persist?.().catch(() => {});
  jobs.set(job.id, job);
  emit();
  return new Promise<string>((resolve, reject) => {
    const unsubscribe = options.onProgress ? subscribeVideoUploads(() => options.onProgress?.(job.progress)) : () => {};
    waiters.set(job.id, {
      resolve: (url) => { unsubscribe(); resolve(url); },
      reject: (error) => { unsubscribe(); reject(error); },
    });
    run(job);
  });
}
export function retryVideoUpload(id: string): void {
  const job = jobs.get(id);
  if (!job || job.ownerId !== identity?.ownerId || active.has(id)) return;
  if (job.state === "complete" || job.state === "cancelled") return;
  void update(job, { state: "preparing", error: undefined }).then(() => run(job)).catch(() => {});
}
export async function cancelVideoUpload(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job || job.ownerId !== identity?.ownerId) return;
  await update(job, { state: "cancelled", error: undefined });
  active.get(id)?.abort();
  if (job.native && hasNativeVideoUpload()) await nativeUploadRequest("cancel", { jobId: id });
  waiters.get(id)?.reject(new Error("Upload cancelled."));
  waiters.delete(id);
  await removeVideoFile(id);
}
export async function dismissVideoUpload(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job || job.ownerId !== identity?.ownerId) return;
  if (active.has(id)) throw new Error("Cancel the upload before removing it.");
  await removeVideoJob(id);
  jobs.delete(id);
  emit();
}
window.addEventListener("online", () => {
  for (const job of jobs.values()) if (job.ownerId === identity?.ownerId && job.state === "paused") retryVideoUpload(job.id);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    for (const job of jobs.values()) if (job.ownerId === identity?.ownerId && job.state === "paused") retryVideoUpload(job.id);
  }
});