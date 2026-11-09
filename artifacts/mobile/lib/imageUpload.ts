import { apiFetch, getBaseUrl } from "@/lib/api";
import { MAX_IMAGE_BYTES } from "@/lib/sellValidation";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

export type LocalSellImage = {
  id: string;
  localUri: string;
  mimeType: string;
  fileName: string;
  byteSize?: number;
  /** Final Wasabi/proxy URL after successful upload */
  remoteUrl?: string;
  status: "pending" | "uploading" | "uploaded" | "error";
  progress: number;
  error?: string;
};

function makeId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createLocalImage(asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}): LocalSellImage {
  return {
    id: makeId(),
    localUri: asset.uri,
    mimeType: asset.mimeType || "image/jpeg",
    fileName: asset.fileName || `listing-${Date.now()}.jpg`,
    byteSize: asset.fileSize ?? undefined,
    status: "pending",
    progress: 0,
  };
}

async function compressImage(uri: string): Promise<{ uri: string; mimeType: string; fileName: string }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 2048 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );
  return {
    uri: result.uri,
    mimeType: "image/jpeg",
    fileName: `listing-${Date.now()}.jpg`,
  };
}

async function readFileInfo(uri: string): Promise<{ size: number }> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || typeof (info as any).size !== "number") {
    throw new Error("Could not read selected image file.");
  }
  return { size: (info as any).size as number };
}

async function uploadViaFallback(
  uri: string,
  fileName: string,
  mimeType: string,
  token: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", {
    uri,
    name: fileName,
    type: mimeType,
  } as any);

  const res = await fetch(`${getBaseUrl()}/storage/uploads/image-fallback`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fallback upload failed (${res.status})`);
  if (typeof data.url !== "string" || !data.url) throw new Error("Upload completed without a URL.");
  return data.url;
}

/**
 * Upload one listing photo to Wasabi via existing request-url → put-proxy flow,
 * with multipart image-fallback for ≤10MB images when primary fails.
 */
export async function uploadListingImage(
  image: LocalSellImage,
  token: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  if (image.remoteUrl) return image.remoteUrl;

  onProgress?.(5);
  const compressed = await compressImage(image.localUri);
  const { size } = await readFileInfo(compressed.uri);
  if (size <= 0) throw new Error("Selected image is empty.");
  if (size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 10 MB or smaller after compression.");
  }
  onProgress?.(15);

  const fallbackEligible = size <= MAX_IMAGE_BYTES;

  try {
    const requestRes = await apiFetch("/storage/uploads/request-url", {
      method: "POST",
      token,
      body: JSON.stringify({
        name: compressed.fileName,
        size,
        contentType: compressed.mimeType,
      }),
    });
    const requestData = await requestRes.json().catch(() => ({}));
    if (!requestRes.ok) {
      throw new Error(requestData.error || `Could not start upload (${requestRes.status})`);
    }

    onProgress?.(35);
    const uploadURL: string = requestData.uploadURL;
    const absoluteUploadUrl = uploadURL.startsWith("http")
      ? uploadURL
      : `${getBaseUrl().replace(/\/api$/, "")}${uploadURL.startsWith("/") ? "" : "/"}${uploadURL}`;

    const putRes = await FileSystem.uploadAsync(absoluteUploadUrl, compressed.uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        "Content-Type": compressed.mimeType,
        Authorization: `Bearer ${token}`,
        "Content-Length": String(size),
      },
    });

    onProgress?.(85);
    if (putRes.status < 200 || putRes.status >= 300) {
      let message = `Upload failed (${putRes.status})`;
      try {
        const body = JSON.parse(putRes.body);
        if (body?.error) message = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    let remoteUrl = typeof requestData.objectPath === "string" ? requestData.objectPath : "";
    try {
      const body = JSON.parse(putRes.body);
      if (typeof body?.url === "string" && body.url) remoteUrl = body.url;
    } catch {
      /* non-JSON */
    }
    if (!remoteUrl) throw new Error("Upload completed without a storage URL.");
    onProgress?.(100);
    return remoteUrl;
  } catch (primaryError: any) {
    if (!fallbackEligible) throw primaryError;
    onProgress?.(50);
    const url = await uploadViaFallback(compressed.uri, compressed.fileName, compressed.mimeType, token);
    onProgress?.(100);
    return url;
  }
}
