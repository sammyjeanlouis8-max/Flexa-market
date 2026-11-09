/**
 * Edit profile — PUT /api/users/:id, language/theme/password, avatar upload via Wasabi proxy.
 */
import { getApiBase } from "./api";

export type ProfileUpdate = {
  name?: string;
  phone?: string;
  location?: string;
  bio?: string;
  avatar?: string;
  dateOfBirth?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
};

export type AuthUserPatch = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  bio?: string | null;
  location?: string | null;
  country?: string | null;
  preferredLanguage?: string | null;
  preferredTheme?: string | null;
  [key: string]: unknown;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authedFetch(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function updateUserProfile(
  userId: number,
  body: ProfileUpdate,
  opts: AuthOpts,
): Promise<AuthUserPatch> {
  const res = await authedFetch(`/users/${userId}`, {
    ...opts,
    method: "PUT",
    body,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Profile update failed (${res.status})`);
  return data as AuthUserPatch;
}

export async function patchPreferredLanguage(
  language: string,
  opts: AuthOpts,
): Promise<{ preferredLanguage: string }> {
  const res = await authedFetch("/auth/language", {
    ...opts,
    method: "PATCH",
    body: { language },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Language update failed (${res.status})`);
  return { preferredLanguage: data.preferredLanguage ?? language };
}

export async function patchPreferredTheme(
  theme: "light" | "dark" | "system",
  opts: AuthOpts,
): Promise<{ preferredTheme: string }> {
  const res = await authedFetch("/auth/theme", {
    ...opts,
    method: "PATCH",
    body: { theme },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Theme update failed (${res.status})`);
  return { preferredTheme: data.preferredTheme ?? theme };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  opts: AuthOpts,
): Promise<{ token?: string }> {
  const res = await authedFetch("/auth/change-password", {
    ...opts,
    method: "POST",
    body: { currentPassword, newPassword },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Password change failed (${res.status})`);
  return { token: typeof data.token === "string" ? data.token : undefined };
}

/**
 * Upload image bytes via request-url + put-proxy. Returns relative Wasabi proxy path.
 */
export async function uploadAvatarImage(
  localUri: string,
  opts: AuthOpts & { contentType?: string; fileName?: string },
): Promise<string> {
  const contentType = opts.contentType || "image/jpeg";
  const fileName = opts.fileName || "avatar.jpg";

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const size = blob.size;
  if (!size) throw new Error("Could not read image file");

  const reqRes = await authedFetch("/storage/uploads/request-url", {
    ...opts,
    method: "POST",
    body: { name: fileName, size, contentType },
  });
  const reqData = await readJson(reqRes);
  if (!reqRes.ok) throw new Error(reqData.error || "Upload request failed");

  const uploadURL: string = reqData.uploadURL;
  if (!uploadURL) throw new Error("No upload URL returned");

  // uploadURL is typically `/api/storage/uploads/put-proxy/...`
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

  // Persist absolute marketplace URL so avatars resolve outside the API host.
  if (url.startsWith("/")) {
    return `https://flexamarket.com${url}`;
  }
  return url;
}
