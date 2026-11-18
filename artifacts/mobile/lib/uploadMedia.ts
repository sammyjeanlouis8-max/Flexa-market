/**
 * Shared image upload via Wasabi request-url + put-proxy.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function uploadListingImage(
  localUri: string,
  opts: AuthOpts & { contentType?: string; fileName?: string },
): Promise<string> {
  const contentType = opts.contentType || "image/jpeg";
  const fileName = opts.fileName || `listing-${Date.now()}.jpg`;

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const size = blob.size;
  if (!size) throw new Error("Could not read image file");

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

  const putRes = await fetch(absolutePut, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      Authorization: `Bearer ${opts.token}`,
    },
    body: blob,
    signal: opts.signal,
  });
  const putData = await readJson(putRes);
  if (!putRes.ok) throw new Error(putData.error || `Upload failed (${putRes.status})`);

  const url: string = putData.url || putData.objectPath || "";
  if (!url) throw new Error("Upload succeeded but no URL returned");
  if (url.startsWith("/")) return `https://flexamarket.com${url}`;
  return url;
}
