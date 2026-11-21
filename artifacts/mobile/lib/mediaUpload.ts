/**
 * Wasabi upload via request-url + put-proxy with progress callbacks.
 * Used by Sell + Chat attachments. Never invents URLs.
 *
 * Android note: fetch(file://…) often fails for expo-av recordings. We read
 * local files through expo-file-system as base64 first.
 */
import * as FileSystem from "expo-file-system/legacy";
import { getApiBase } from "./api";

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type UploadResult = {
  url: string;
  contentType: string;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  // Prefer global atob (Hermes / browsers). Avoid Node Buffer in RN.
  const decode =
    typeof globalThis.atob === "function"
      ? globalThis.atob
      : (s: string) => {
          // Minimal base64 decode fallback
          const chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
          let str = s.replace(/=+$/, "");
          let output = "";
          for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
            const idx = chars.indexOf(buffer);
            if (idx === -1) continue;
            bs = bc % 4 ? bs * 64 + idx : idx;
            if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
          }
          return output;
        };
  const binary = decode(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readLocalBlob(
  localUri: string,
  contentType: string,
): Promise<Blob> {
  const isLocal =
    localUri.startsWith("file:") ||
    localUri.startsWith("content:") ||
    localUri.startsWith("/");

  if (isLocal) {
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists) throw new Error("Local file missing");
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64) throw new Error("Could not read file");
      const bytes = base64ToUint8Array(base64);
      // Copy into a fresh ArrayBuffer so BlobPart typing accepts it (TS 5.x).
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new Blob([copy], { type: contentType });
    } catch (fsErr) {
      // Fall through to fetch for content:// quirks
      try {
        const fileRes = await fetch(localUri);
        const blob = await fileRes.blob();
        if (blob.size) return blob;
      } catch {
        /* rethrow FS error */
      }
      throw fsErr instanceof Error
        ? fsErr
        : new Error("Could not read local recording");
    }
  }

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  if (!blob.size) throw new Error("Could not read file");
  return blob;
}

/**
 * Upload a local file URI. Uses XHR so upload progress is available on Android.
 */
export async function uploadLocalFile(
  localUri: string,
  opts: AuthOpts & {
    contentType?: string;
    fileName?: string;
    onProgress?: (p: UploadProgress) => void;
  },
): Promise<UploadResult> {
  const contentType = opts.contentType || "image/jpeg";
  const fileName = opts.fileName || "upload.bin";

  const blob = await readLocalBlob(localUri, contentType);
  const size = blob.size;
  if (!size) throw new Error("Could not read file");

  const reqRes = await fetch(`${getApiBase()}/storage/uploads/request-url`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ name: fileName, size, contentType }),
    signal: opts.signal,
  });
  const reqData = await readJson(reqRes);
  if (!reqRes.ok) throw new Error(reqData.error || "Upload request failed");
  const uploadURL: string = reqData.uploadURL;
  if (!uploadURL) throw new Error("No upload URL returned");

  const absolutePut = uploadURL.startsWith("http")
    ? uploadURL
    : `${getApiBase().replace(/\/api$/, "")}${uploadURL}`;

  const putData = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", absolutePut);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.token}`);
    xhr.responseType = "json";
    if (opts.signal) {
      const onAbort = () => {
        xhr.abort();
        reject(new Error("Upload cancelled"));
      };
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable || !opts.onProgress) return;
      opts.onProgress({
        loaded: evt.loaded,
        total: evt.total,
        percent: Math.round((evt.loaded / evt.total) * 100),
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response ?? {});
      } else {
        const err =
          (xhr.response && (xhr.response.error || xhr.response.message)) ||
          `Upload failed (${xhr.status})`;
        reject(new Error(String(err)));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });

  let url: string = putData?.url || "";
  if (!url) throw new Error("Upload succeeded but no URL returned");
  if (url.startsWith("/")) url = `https://flexamarket.com${url}`;
  return { url, contentType };
}
