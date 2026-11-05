/**
 * Client-side image compression for chat uploads.
 * Resizes oversized photos, corrects EXIF orientation via drawImage,
 * and prefers WebP when the browser encodes it (falls back to JPEG).
 * Skips compression when the file is already small enough.
 */

const MAX_EDGE = 1600;
const TARGET_BYTES = 900_000; // ~900KB — skip if already under
const QUALITY_STEPS = [0.82, 0.72, 0.62];

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

export async function compressChatImage(file: File): Promise<{ blob: Blob; contentType: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return { blob: file, contentType: file.type || "application/octet-stream" };
  }

  // Already small — keep original quality
  if (file.size <= TARGET_BYTES && file.size <= 400_000) {
    return { blob: file, contentType: file.type };
  }

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    // No meaningful resize and already under target — keep original
    if (scale >= 0.98 && file.size <= TARGET_BYTES) {
      return { blob: file, contentType: file.type };
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, contentType: file.type };
    ctx.drawImage(img, 0, 0, w, h);

    const preferWebp = typeof canvas.toBlob === "function";
    const types = preferWebp ? (["image/webp", "image/jpeg"] as const) : (["image/jpeg"] as const);

    let best: Blob | null = null;
    let bestType = file.type || "image/jpeg";

    for (const type of types) {
      for (const q of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, type, q);
        if (!blob) continue;
        if (!best || blob.size < best.size) {
          best = blob;
          bestType = type;
        }
        if (blob.size <= TARGET_BYTES) {
          // Prefer compressed only when it actually saves space
          if (blob.size < file.size * 0.92) {
            return { blob, contentType: type };
          }
          return { blob: file, contentType: file.type };
        }
      }
      // If WebP worked at all, don't also try JPEG unless WebP failed
      if (best && bestType === "image/webp") break;
    }

    if (best && best.size < file.size * 0.92) {
      return { blob: best, contentType: bestType };
    }
    return { blob: file, contentType: file.type };
  } catch {
    return { blob: file, contentType: file.type || "application/octet-stream" };
  }
}
