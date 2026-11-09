/**
 * Wasabi upload via request-url + put-proxy with progress callbacks.
 * Used by Sell + Chat attachments. Never invents URLs.
 */
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

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
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
