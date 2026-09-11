declare global {
  interface Window {
    __flexaBackgroundUploadsV1?: boolean;
  }
}

type BridgeWindow = Window & {
  ReactNativeWebView?: { postMessage(message: string): void };
  webkit?: { messageHandlers?: { flexaUpload?: { postMessage(message: unknown): void } } };
};

export function hasNativeVideoUpload(): boolean {
  return window.__flexaBackgroundUploadsV1 === true;
}

export function nativeUploadRequest<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("flexa-upload-result", onResult);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.requestId !== requestId) return;
      cleanup();
      if (detail.ok) resolve(detail.data as T);
      else reject(new Error(typeof detail.error === "string" ? detail.error : "Native upload failed. Try again."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The background upload service did not respond. Try again."));
    }, 30_000);
    window.addEventListener("flexa-upload-result", onResult);
    signal?.addEventListener("abort", onAbort, { once: true });
    const bridge = window as BridgeWindow;
    const message = { type: "flexa-upload", requestId, action, ...payload };
    try {
      if (bridge.webkit?.messageHandlers?.flexaUpload) {
        bridge.webkit.messageHandlers.flexaUpload.postMessage(message);
      } else if (bridge.ReactNativeWebView) {
        bridge.ReactNativeWebView.postMessage(JSON.stringify(message));
      } else throw new Error("Background upload requires an updated native app.");
    } catch (error) { cleanup(); reject(error); }
  });
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

export async function stageNativeVideo(
  file: Blob,
  metadata: Record<string, unknown>,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<void> {
  const initialized = await nativeUploadRequest<{ bytesStaged?: number }>("begin", metadata, signal);
  const step = 1024 * 1024;
  let offset = initialized.bytesStaged ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size) {
    throw new Error("Invalid native upload progress. Try again.");
  }
  while (offset < file.size) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const end = Math.min(offset + step, file.size);
    const data = await base64(file.slice(offset, end));
    const saved = await nativeUploadRequest<{ bytesStaged: number }>("append", {
      jobId: metadata.jobId, offset, data,
    }, signal);
    if (saved.bytesStaged !== end) throw new Error("Could not safely prepare the video. Try again.");
    offset = end;
    onProgress(Math.round(offset / file.size * 100));
  }
  await nativeUploadRequest("start", { jobId: metadata.jobId }, signal);
}