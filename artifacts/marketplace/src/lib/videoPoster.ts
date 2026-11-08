export function captureVideoPosterFrame(
  video: HTMLVideoElement,
  maxWidth = 720,
  maxHeight = 1280,
): string | null {
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    return null;
  }

  const scale = Math.min(
    1,
    maxWidth / video.videoWidth,
    maxHeight / video.videoHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;

  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Higher quality so Boost / promo upload previews look sharp.
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return null;
  }
}

function waitForEvent(target: EventTarget, eventName: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      target.removeEventListener(eventName, done);
      resolve();
    };
    target.addEventListener(eventName, done, { once: true });
    window.setTimeout(done, timeoutMs);
  });
}

/**
 * Seek slightly into the clip so mobile Safari decodes a real frame, then
 * capture a JPEG poster. Returns null when the browser cannot paint a frame.
 */
export async function extractVideoPoster(
  source: string | File,
  maxWidth = 720,
  maxHeight = 1280,
): Promise<string | null> {
  const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
  const src = typeof source === "string" ? source : objectUrl!;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.src = src;

  try {
    await Promise.race([
      waitForEvent(video, "loadeddata"),
      waitForEvent(video, "loadedmetadata"),
    ]);

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = duration > 0.35 ? Math.min(0.25, duration * 0.08) : 0.001;
    try {
      video.currentTime = target;
      await waitForEvent(video, "seeked", 5000);
    } catch {
      // Some engines refuse seek before enough data — try a muted play pulse.
    }

    let frame = captureVideoPosterFrame(video, maxWidth, maxHeight);
    if (!frame) {
      try {
        await video.play();
        await waitForEvent(video, "playing", 3000);
        video.pause();
        frame = captureVideoPosterFrame(video, maxWidth, maxHeight);
      } catch {
        frame = captureVideoPosterFrame(video, maxWidth, maxHeight);
      }
    }
    return frame;
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
