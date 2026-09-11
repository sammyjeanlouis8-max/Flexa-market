import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({
  jobs: new Map<string, Record<string, any>>(),
  files: new Map<string, Blob>(),
  storageCalls: [] as string[],
  timeline: [] as string[],
  fetchCalls: [] as Array<{ url: string; init: Record<string, any> }>,
  nativeAvailable: false,
  nativeCalls: [] as Array<{ action: string; payload: Record<string, unknown> }>,
  stageStarted: false,
  saveNewWait: false,
  saveNewStarted: false,
  saveNewRelease: null as (() => void) | null,
  nextId: 0,
}));

vi.mock("../../../marketplace/src/lib/videoUploadStorage", () => ({
  loadVideoJobs: vi.fn(async () => [...memory.jobs.values()].map((job) => ({ ...job }))),
  saveVideoJob: vi.fn(async (job: { id: string }) => {
    memory.storageCalls.push(`save:${job.id}`);
    memory.jobs.set(job.id, { ...job });
  }),
  loadVideoFile: vi.fn(async (id: string) => memory.files.get(id)),
  removeVideoFile: vi.fn(async (id: string) => {
    memory.storageCalls.push(`remove-file:${id}`);
    memory.files.delete(id);
  }),
  saveNewVideoJob: vi.fn(async (job: { id: string }, file: Blob) => {
    memory.storageCalls.push(`save-new:${job.id}`);
    memory.timeline.push(`save-new:${job.id}`);
    if (memory.saveNewWait) {
      memory.saveNewStarted = true;
      await new Promise<void>((resolve) => {
        memory.saveNewRelease = resolve;
      });
    }
    memory.jobs.set(job.id, { ...job });
    memory.files.set(job.id, file);
  }),
  removeVideoJob: vi.fn(async (id: string) => {
    memory.storageCalls.push(`remove-job:${id}`);
    memory.jobs.delete(id);
    memory.files.delete(id);
  }),
}));

vi.mock("../../../marketplace/src/lib/nativeVideoUpload", () => ({
  hasNativeVideoUpload: vi.fn(() => memory.nativeAvailable),
  nativeUploadRequest: vi.fn(async (
    action: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    memory.nativeCalls.push({ action, payload });
    return {};
  }),
  stageNativeVideo: vi.fn(async (
    _file: Blob,
    _metadata: Record<string, unknown>,
    signal: AbortSignal,
  ) => {
    memory.stageStarted = true;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }),
}));

type Listener = (event: Event) => void;

function eventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) {
      const current = listeners.get(type) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
}

function installBrowserGlobals() {
  const windowTarget = eventTarget();
  const documentTarget = eventTarget();
  vi.stubGlobal("window", {
    ...windowTarget,
    origin: "https://flexa.test",
    location: { origin: "https://flexa.test" },
    __flexaBackgroundUploadsV1: false,
  });
  vi.stubGlobal("document", {
    ...documentTarget,
    visibilityState: "hidden",
  });
  vi.stubGlobal("navigator", {
    storage: { persist: vi.fn(async () => true) },
    locks: undefined,
  });
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `video-job-${++memory.nextId}`),
  });
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setFetch(
  implementation: (url: string, init: Record<string, any>) => Response | Promise<Response>,
) {
  vi.stubGlobal("fetch", vi.fn((input: unknown, init: Record<string, any> = {}) => {
    const url = String(input);
    memory.fetchCalls.push({ url, init });
    memory.timeline.push(`fetch:${url}`);
    return implementation(url, init);
  }));
}

function videoFile(bytes = 32) {
  const file = new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
  Object.defineProperty(file, "name", { value: "clip.mp4" });
  return file as unknown as File;
}

function savedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "resume-job",
    ownerId: 7,
    purpose: "listing",
    fileName: "clip.mp4",
    totalBytes: 8 * 1024 * 1024 + 2,
    progress: 20,
    state: "paused",
    native: false,
    contentType: "video/mp4",
    uploadId: "session-1",
    updatedAt: Date.now(),
    ...overrides,
  };
}

async function queueModule() {
  return import("../../../marketplace/src/lib/videoUploadQueue");
}

async function waitFor(predicate: () => boolean, message = "condition was not reached") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(message);
}

beforeEach(() => {
  memory.jobs.clear();
  memory.files.clear();
  memory.storageCalls.length = 0;
  memory.timeline.length = 0;
  memory.fetchCalls.length = 0;
  memory.nativeCalls.length = 0;
  memory.nativeAvailable = false;
  memory.stageStarted = false;
  memory.saveNewWait = false;
  memory.saveNewStarted = false;
  memory.saveNewRelease = null;
  memory.nextId = 0;
  vi.resetModules();
  installBrowserGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("video upload queue persistence and resume", () => {
  it("persists the source blob before making the first network request", async () => {
    const queue = await queueModule();
    let sourceWasPersistedAtRequest = false;
    setFetch((url) => {
      const id = [...memory.jobs.keys()][0];
      if (url.endsWith("/chunk-init")) sourceWasPersistedAtRequest = memory.files.has(id);
      if (url.endsWith("/chunk-init")) return jsonResponse({ uploadId: "session-1" });
      return jsonResponse({ status: "complete", url: "/api/storage/video/proof-1" });
    });

    const result = await queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "listing",
    });

    expect(result).toBe("/api/storage/video/proof-1");
    expect(sourceWasPersistedAtRequest).toBe(true);
    expect(memory.timeline.indexOf(`save-new:video-job-1`)).toBeLessThan(
      memory.timeline.findIndex((entry) => entry.startsWith("fetch:")),
    );
  });

  it("resumes a saved session without re-uploading received chunk indices", async () => {
    const queue = await queueModule();
    const file = videoFile(8 * 1024 * 1024 + 2);
    memory.jobs.set("resume-job", savedJob());
    memory.files.set("resume-job", file);
    let statusRequests = 0;
    setFetch((url) => {
      if (url.includes("/chunk-status/")) {
        statusRequests += 1;
        return statusRequests === 1
          ? jsonResponse({ status: "uploading", receivedChunkIndices: [0], totalChunks: 2 })
          : jsonResponse({ status: "complete", url: "/api/storage/video/resumed" });
      }
      if (url.includes("/chunk/")) return jsonResponse({ status: "received" });
      if (url.endsWith("/chunk-finalize/session-1")) return jsonResponse({ status: "processing" });
      throw new Error(`Unexpected upload request: ${url}`);
    });

    queue.setVideoUploadIdentity(7, "token-a");
    await waitFor(() => memory.jobs.get("resume-job")?.state === "complete");

    const uploadedChunks = memory.fetchCalls
      .filter(({ url }) => url.includes("/chunk/session-1/"))
      .map(({ url }) => url.split("/").pop());
    expect(uploadedChunks).toEqual(["1"]);
    expect(memory.files.has("resume-job")).toBe(false);
    expect(queue.getVideoUploads()).toEqual([
      expect.objectContaining({
        id: "resume-job",
        ownerId: 7,
        state: "complete",
        progress: 100,
        url: "/api/storage/video/resumed",
      }),
    ]);
  });

  it("starts every paused queued restore after the first restored upload completes", async () => {
    const queue = await queueModule();
    memory.jobs.set("resume-a", savedJob({
      id: "resume-a",
      fileName: "first.mp4",
      totalBytes: 1,
      uploadId: "session-a",
    }));
    memory.jobs.set("resume-b", savedJob({
      id: "resume-b",
      fileName: "second.mp4",
      totalBytes: 1,
      uploadId: "session-b",
    }));
    memory.files.set("resume-a", videoFile(1));
    memory.files.set("resume-b", videoFile(1));
    setFetch((url) => {
      if (url.includes("/chunk-status/session-a")) {
        return jsonResponse({ status: "complete", url: "/api/storage/video/first" });
      }
      if (url.includes("/chunk-status/session-b")) {
        return jsonResponse({ status: "complete", url: "/api/storage/video/second" });
      }
      throw new Error(`Unexpected restore request: ${url}`);
    });

    queue.setVideoUploadIdentity(7, "token-a");
    await waitFor(() =>
      memory.jobs.get("resume-a")?.state === "complete" &&
      memory.jobs.get("resume-b")?.state === "complete",
    );

    const restoredSessions = memory.fetchCalls
      .filter(({ url }) => url.includes("/chunk-status/"))
      .map(({ url }) => url.split("/").pop());
    expect(restoredSessions).toEqual(["session-a", "session-b"]);
    expect(memory.files.has("resume-a")).toBe(false);
    expect(memory.files.has("resume-b")).toBe(false);
    expect(queue.getVideoUploads()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "resume-a", state: "complete" }),
      expect.objectContaining({ id: "resume-b", state: "complete" }),
    ]));
  });

  it("releases the local blob only after the server reports completion", async () => {
    const queue = await queueModule();
    setFetch((url) => {
      if (url.endsWith("/chunk-init")) return jsonResponse({ uploadId: "session-2" });
      return jsonResponse({ status: "complete", url: "/api/storage/video/final" });
    });

    const result = await queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "boost",
    });
    const id = [...memory.jobs.keys()][0];

    expect(result).toBe("/api/storage/video/final");
    expect(memory.storageCalls).toContain(`remove-file:${id}`);
    expect(memory.files.has(id)).toBe(false);
    expect(memory.jobs.get(id)).toMatchObject({ state: "complete", progress: 100 });
  });

  it("keeps the source blob after a network failure so retry remains possible", async () => {
    vi.useFakeTimers();
    const queue = await queueModule();
    setFetch(() => {
      throw new TypeError("offline");
    });

    const upload = queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "listing",
    });
    const rejection = expect(upload).rejects.toThrow("offline");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;

    const id = [...memory.jobs.keys()][0];
    expect(memory.fetchCalls).toHaveLength(4);
    expect(memory.jobs.get(id)).toMatchObject({ state: "paused", error: "offline" });
    expect(memory.files.has(id)).toBe(true);
  });
});

describe("video upload queue identity and cancellation races", () => {
  it("does not complete a stale owner job when a delayed response ignores abort", async () => {
    const queue = await queueModule();
    let resolveStatus!: (response: Response) => void;
    const delayedStatus = new Promise<Response>((resolve) => {
      resolveStatus = resolve;
    });
    setFetch((url) => {
      if (url.endsWith("/chunk-init")) return jsonResponse({ uploadId: "delayed-session" });
      if (url.includes("/chunk-status/delayed-session")) return delayedStatus;
      throw new Error(`Unexpected stale-owner request: ${url}`);
    });

    const upload = queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "listing",
    });
    const rejection = expect(upload).rejects.toMatchObject({ name: "AbortError" });
    await waitFor(() => memory.fetchCalls.some(({ url }) => url.includes("/chunk-status/")));
    const id = [...memory.jobs.keys()][0];

    queue.setVideoUploadIdentity(8, "token-b");
    resolveStatus(jsonResponse({
      status: "complete",
      url: "/api/storage/video/stale-owner",
    }));
    await rejection;

    expect(queue.getVideoUploads()).toEqual([]);
    expect(memory.jobs.get(id)).toMatchObject({ ownerId: 7, state: "paused" });
    expect(memory.files.has(id)).toBe(true);
    expect(memory.storageCalls).not.toContain(`remove-file:${id}`);
  });

  it("rejects instead of hanging when identity switches during source persistence", async () => {
    const queue = await queueModule();
    memory.saveNewWait = true;
    setFetch(() => {
      throw new Error("No request should start after an identity switch");
    });

    const upload = queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "listing",
    });
    const rejection = expect(upload).rejects.toMatchObject({
      code: "UPLOAD_AUTH_REQUIRED",
      status: 401,
    });
    await waitFor(() => memory.saveNewStarted);

    queue.setVideoUploadIdentity(8, "token-b");
    expect(queue.getVideoUploads()).toEqual([]);
    memory.saveNewRelease?.();
    await rejection;

    const id = [...memory.jobs.keys()][0];
    expect(memory.jobs.get(id)).toMatchObject({
      ownerId: 7,
      state: "paused",
      error: "Sign in to resume this upload.",
    });
    expect(memory.files.has(id)).toBe(true);
    expect(memory.fetchCalls).toEqual([]);
  });

  it("hides and aborts an active upload when the owner changes", async () => {
    const queue = await queueModule();
    setFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener("abort", abort, { once: true });
    }));

    const upload = queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "listing",
    });
    await waitFor(() => memory.fetchCalls.length === 1);
    const id = [...memory.jobs.keys()][0];

    queue.setVideoUploadIdentity(8, "token-b");
    expect(queue.getVideoUploads()).toEqual([]);
    await expect(upload).rejects.toMatchObject({ name: "AbortError" });

    expect(memory.jobs.get(id)).toMatchObject({ ownerId: 7, state: "paused" });
    expect(memory.files.has(id)).toBe(true);
    expect(memory.fetchCalls.every(({ init }) => init.headers?.Authorization === "Bearer token-a")).toBe(true);
  });

  it("cancels an active request, clears its blob, and allows resumable metadata cleanup", async () => {
    const queue = await queueModule();
    setFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener("abort", abort, { once: true });
    }));

    const upload = queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "listing",
    });
    await waitFor(() => memory.fetchCalls.length === 1);
    const id = [...memory.jobs.keys()][0];

    await queue.cancelVideoUpload(id);
    await expect(upload).rejects.toThrow("Upload cancelled.");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(memory.jobs.get(id)).toMatchObject({ state: "cancelled", error: undefined });
    expect(memory.files.has(id)).toBe(false);
    expect(memory.fetchCalls).toHaveLength(1);

    await queue.dismissVideoUpload(id);
    expect(memory.jobs.has(id)).toBe(false);
  });

  it("cancels the native bridge and hides native work on an owner switch", async () => {
    memory.nativeAvailable = true;
    const queue = await queueModule();
    setFetch((url) => {
      if (url.endsWith("/chunk-init")) return jsonResponse({ uploadId: "native-session" });
      if (url.includes("/chunk-status/")) return jsonResponse({ status: "uploading" });
      throw new Error(`Unexpected native upload request: ${url}`);
    });

    const upload = queue.startVideoUpload(videoFile(), "token-a", {
      ownerId: 7,
      purpose: "listing",
    });
    await waitFor(() => memory.stageStarted);
    const id = [...memory.jobs.keys()][0];

    queue.setVideoUploadIdentity(8, "token-b");
    await expect(upload).rejects.toMatchObject({ name: "AbortError" });

    expect(queue.getVideoUploads()).toEqual([]);
    expect(memory.nativeCalls).toContainEqual({
      action: "cancel",
      payload: { jobId: id },
    });
    expect(memory.files.has(id)).toBe(true);
  });
});