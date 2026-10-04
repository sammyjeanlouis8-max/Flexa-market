/**
 * Browser metadata is advisory. Safari/WebViews can emit neither metadata nor
 * an error for phone videos; never let that stop the durable upload indefinitely.
 * The upload server still probes the real file and enforces the duration limit.
 */
export function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    let video: HTMLVideoElement | undefined;
    let url: string | undefined;
    let settled = false;
    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (video) {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute("src");
        // Release the local media decoder before uploading the original file.
        try { video.load(); } catch { /* Native upload/server probing still works. */ }
      }
      if (url) URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) && duration > 0 ? duration : NaN);
    };
    const timer = setTimeout(() => finish(NaN), 10_000);
    try {
      video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => finish(video!.duration);
      video.onerror = () => finish(NaN);
      url = URL.createObjectURL(file);
      video.src = url;
      // Explicit load is needed by some Safari and embedded WebView builds.
      video.load();
    } catch {
      finish(NaN);
    }
  });
}