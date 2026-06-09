/**
 * CLEAN VIDEO UPLOAD HOOK (Rebuilt)
 *
 * Handles the full upload pipeline:
 *   1. Validate file type + size
 *   2. Request a proxy URL from /api/storage/uploads/request-url
 *   3. Stream the file to /api/storage/uploads/put-proxy/:token
 *   4. Receive the Cloudinary URL back
 *   5. Return the final URL for DB storage
 *
 * Progress: 0 → 10 (pre-flight) → 10–95 (transfer) → 100 (done)
 */
import { useState, useCallback } from "react";

export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",  // .mov — iPhone default
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
  "video/3gpp2",
];

export const MAX_VIDEO_SIZE_BYTES = 350 * 1024 * 1024; // 350 MB

export interface VideoUploadResult {
  url: string;       // Cloudinary https:// URL (with fl_faststart already applied)
  publicId: string;  // Cloudinary public_id for poster generation
}

interface UseVideoUploadOptions {
  onSuccess?: (result: VideoUploadResult) => void;
  onError?: (error: Error) => void;
}

export function useVideoUpload(options: UseVideoUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(
    async (file: File, authToken?: string | null): Promise<VideoUploadResult | null> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        // ── Validate ──────────────────────────────────────────────────────
        if (!ACCEPTED_VIDEO_TYPES.includes(file.type) && !file.type.startsWith("video/")) {
          throw new Error(
            `Unsupported video format: ${file.type || "unknown"}. Please use MP4 or MOV.`,
          );
        }
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
          const mb = (file.size / 1024 / 1024).toFixed(0);
          throw new Error(`Video is too large (${mb} MB). Maximum is 350 MB.`);
        }

        setProgress(5);

        // ── Request proxy URL ─────────────────────────────────────────────
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

        const urlResp = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || "video/mp4",
          }),
        });
        if (!urlResp.ok) {
          const d = await urlResp.json().catch(() => ({}));
          throw new Error(d.error ?? "Could not start upload. Please try again.");
        }
        const { uploadURL } = await urlResp.json();

        setProgress(10);

        // ── Upload via XHR for real progress events ───────────────────────
        const finalUrl = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadURL);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

          let onloadFired = false;

          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable || onloadFired) return;
            // Map 0–100% of bytes to the 10–95% progress slot
            setProgress(10 + Math.round((e.loaded / e.total) * 85));
          };

          xhr.onload = () => {
            onloadFired = true;
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error(`Upload rejected by server (HTTP ${xhr.status}). Please retry.`));
              return;
            }
            try {
              const data = JSON.parse(xhr.responseText);
              if (typeof data?.url === "string" && data.url.startsWith("http")) {
                resolve(data.url);
                return;
              }
            } catch { /* not JSON */ }
            reject(new Error("Upload succeeded but server returned no URL. Please retry."));
          };

          xhr.onerror = () => reject(new Error("Network error during upload. Check your connection."));
          xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller file or better connection."));
          xhr.onabort = () => reject(new Error("Upload was cancelled."));
          xhr.send(file);
        });

        setProgress(98);

        // ── Extract publicId from Cloudinary URL ──────────────────────────
        // URL format: https://res.cloudinary.com/<cloud>/video/upload/<transforms>/<folder>/<id>.mp4
        let publicId = "";
        try {
          const m = finalUrl.match(/\/flexa-market\/(.+?)\.[^.]+$/);
          if (m) publicId = `flexa-market/${m[1]}`;
        } catch { /* publicId optional */ }

        const result: VideoUploadResult = { url: finalUrl, publicId };
        setProgress(100);
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error("Upload failed. Please try again.");
        setError(e);
        options.onError?.(e);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [options],
  );

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  return { upload, isUploading, progress, error, reset };
}
