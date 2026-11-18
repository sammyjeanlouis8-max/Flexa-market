/**
 * Copy picked content:// / cloud-backed URIs into the app documents directory
 * so drafts survive process death / restart without broad storage permission.
 */
import * as FileSystem from "expo-file-system/legacy";

function extFromNameOrType(fileName?: string | null, mimeType?: string | null): string {
  const fromName = fileName?.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  if (!mimeType) return "bin";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("quicktime") || mimeType.includes("mov")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("m4a") || mimeType.includes("mp4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("pdf")) return "pdf";
  return "bin";
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  // Prefer FileReader when available (Hermes / RN fetch blobs).
  if (typeof Blob !== "undefined" && typeof FileReader !== "undefined") {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer]);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("base64 encode failed"));
      reader.readAsDataURL(blob);
    });
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // eslint-disable-next-line no-undef
  return typeof btoa === "function" ? btoa(binary) : binary;
}

/** Persist a picked URI under documentDirectory/picked/ for draft survival. */
export async function persistPickedFile(
  uri: string,
  opts?: { fileName?: string | null; mimeType?: string | null; prefix?: string },
): Promise<string> {
  if (!uri) throw new Error("Missing file URI");
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;

  const docs = FileSystem.documentDirectory;
  if (!docs) return uri;

  const dir = `${docs}picked/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    /* best-effort */
  }

  if (uri.startsWith(dir) || uri.startsWith(docs)) return uri;

  const ext = extFromNameOrType(opts?.fileName, opts?.mimeType);
  const prefix = opts?.prefix || "media";
  const dest = `${dir}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    try {
      const res = await fetch(uri);
      const buf = new Uint8Array(await res.arrayBuffer());
      const b64 = await bytesToBase64(buf);
      await FileSystem.writeAsStringAsync(dest, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return dest;
    } catch {
      return uri;
    }
  }
}
