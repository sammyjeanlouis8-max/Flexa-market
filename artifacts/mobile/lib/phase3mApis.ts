/**
 * Phase 3M API clients — broadcast, push campaigns, TV/Music CMS, security tools, phone OTP.
 * Server RBAC remains authoritative (requireSuperAdmin / requireAdmin / requireRole).
 */
import { getApiBase } from "./api";

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

async function requireOk(res: Response, fallback: string): Promise<any> {
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || data.message || `${fallback} (${res.status})`);
  return data;
}

// ── Phone OTP (login) — never use withdrawalToken as a login credential ──────

export async function sendPhoneOtp(input: {
  phone: string;
  country: string;
}): Promise<{ message?: string; sent?: boolean; channel?: string; devCode?: string; maskedPhone?: string }> {
  const res = await fetch(`${getApiBase()}/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ phone: input.phone, country: input.country }),
  });
  return requireOk(res, "Send phone OTP failed");
}

export async function verifyPhoneOtp(input: {
  phone: string;
  country: string;
  code: string;
}): Promise<{ phoneToken: string; phone: string; country: string }> {
  const res = await fetch(`${getApiBase()}/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  const data = await requireOk(res, "Verify phone OTP failed");
  if (!data.phoneToken || typeof data.phoneToken !== "string") {
    throw new Error("Server did not return phoneToken — cannot complete phone login");
  }
  if (data.withdrawalToken) {
    throw new Error("Unexpected withdrawalToken on phone verify — refusing unsafe login");
  }
  return { phoneToken: data.phoneToken, phone: data.phone, country: data.country };
}

export async function loginWithPhoneToken(input: {
  phoneToken: string;
  eulaAccepted: boolean;
}): Promise<{ token: string; user: any }> {
  const res = await fetch(`${getApiBase()}/auth/login-phone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return requireOk(res, "Phone login failed");
}

// ── Broadcast email / SMS (superadmin) ───────────────────────────────────────

export async function fetchBroadcastEmailRecipients(opts: AuthOpts): Promise<{ users: any[]; total: number }> {
  const res = await authedFetch("/admin/broadcast-recipients", opts);
  return requireOk(res, "Email recipients failed");
}

export async function fetchBroadcastSmsRecipients(
  opts: AuthOpts & { country?: string },
): Promise<{ users: any[]; total: number; twilioConfigured?: boolean }> {
  const q = opts.country ? `?country=${encodeURIComponent(opts.country)}` : "";
  const res = await authedFetch(`/admin/broadcast-sms-recipients${q}`, opts);
  return requireOk(res, "SMS recipients failed");
}

export async function postBroadcastEmail(
  body: { subject: string; htmlBody: string; testEmail?: string; recipientIds?: number[] },
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch("/admin/broadcast-email", { ...opts, method: "POST", body });
  return requireOk(res, "Broadcast email failed");
}

export async function postBroadcastSms(
  body: { message: string; testPhone?: string; recipientIds?: number[] },
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch("/admin/broadcast-sms", { ...opts, method: "POST", body });
  return requireOk(res, "Broadcast SMS failed");
}

// ── Manual push campaigns (superadmin) ───────────────────────────────────────

export async function fetchPushManualRecipients(
  opts: AuthOpts & { q?: string; country?: string },
): Promise<{ recipients: any[]; totalEligibleUsers: number }> {
  const q = new URLSearchParams();
  if (opts.q) q.set("q", opts.q);
  if (opts.country) q.set("country", opts.country);
  const res = await authedFetch(`/push/manual-recipients?${q}`, opts);
  return requireOk(res, "Push recipients failed");
}

export async function postPushManualSend(
  body: {
    audience: "all" | "countries" | "country" | "user";
    title: string;
    message: string;
    url?: string;
    country?: string;
    countries?: string[];
    userId?: number;
  },
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch("/push/manual-send", { ...opts, method: "POST", body });
  return requireOk(res, "Push send failed");
}

// ── Flexa TV CMS (admin) ─────────────────────────────────────────────────────

export async function fetchAdminTvPrograms(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/tv/programs", opts);
  const data = await requireOk(res, "TV programs failed");
  return Array.isArray(data) ? data : Array.isArray(data.programs) ? data.programs : [];
}

export async function fetchAdminTvSeries(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/tv/series", opts);
  const data = await requireOk(res, "TV series failed");
  return Array.isArray(data) ? data : Array.isArray(data.series) ? data.series : [];
}

export async function fetchAdminTvViewers(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/tv/broadcast/viewers", opts);
  return requireOk(res, "TV viewers failed");
}

export async function postAdminTvBroadcast(
  action: "play" | "pause" | "stop",
  opts: AuthOpts & { programId?: number },
): Promise<any> {
  const body = action === "play" && opts.programId ? { programId: opts.programId } : undefined;
  const res = await authedFetch(`/admin/tv/broadcast/${action}`, {
    ...opts,
    method: "POST",
    body,
  });
  return requireOk(res, `TV broadcast ${action} failed`);
}

export async function createAdminTvProgram(
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch("/admin/tv/programs", { ...opts, method: "POST", body });
  return requireOk(res, "Create TV program failed");
}

export async function updateAdminTvProgram(
  id: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch(`/admin/tv/programs/${id}`, { ...opts, method: "PUT", body });
  return requireOk(res, "Update TV program failed");
}

export async function deleteAdminTvProgram(id: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/admin/tv/programs/${id}`, { ...opts, method: "DELETE" });
  await requireOk(res, "Delete TV program failed");
}

/** Multipart video upload — verified POST /api/admin/tv/upload-video */
export async function uploadAdminTvVideo(
  localUri: string,
  opts: AuthOpts & { fileName?: string; mimeType?: string },
): Promise<{ videoUrl: string }> {
  const form = new FormData();
  form.append("video", {
    uri: localUri,
    name: opts.fileName || "tv-upload.mp4",
    type: opts.mimeType || "video/mp4",
  } as unknown as Blob);
  const res = await fetch(`${getApiBase()}/admin/tv/upload-video`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: form,
    signal: opts.signal,
  });
  const data = await requireOk(res, "TV video upload failed");
  const videoUrl = String(data.videoUrl || "").trim();
  if (!videoUrl) throw new Error("Upload returned no videoUrl");
  return { videoUrl };
}

// ── Flexa Music CMS (admin) ──────────────────────────────────────────────────

export async function fetchAdminMusicArtists(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/music/artists", opts);
  const data = await requireOk(res, "Music artists failed");
  return Array.isArray(data) ? data : Array.isArray(data.artists) ? data.artists : [];
}

export async function verifyAdminMusicArtist(
  body: { artist: string; is_verified: boolean },
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch("/admin/music/artists/verify", {
    ...opts,
    method: "PUT",
    body,
  });
  await requireOk(res, "Verify artist failed");
}

export async function fetchAdminMusicPlaylists(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/music/playlists", opts);
  const data = await requireOk(res, "Music playlists failed");
  return Array.isArray(data) ? data : Array.isArray(data.playlists) ? data.playlists : [];
}

export async function fetchAdminMusicStorageStats(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/music/storage-stats", opts);
  return requireOk(res, "Music storage stats failed");
}

export async function postAdminMusicBulkAction(
  body: { action: string; ids: number[] },
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch("/admin/music/bulk-action", { ...opts, method: "POST", body });
  return requireOk(res, "Music bulk action failed");
}

export async function fetchPublicMusicTracks(opts?: { q?: string; signal?: AbortSignal }): Promise<any[]> {
  const q = new URLSearchParams();
  if (opts?.q) q.set("q", opts.q);
  q.set("limit", "50");
  const res = await fetch(`${getApiBase()}/music?${q}`, {
    headers: { Accept: "application/json" },
    signal: opts?.signal,
  });
  const data = await requireOk(res, "Music catalog failed");
  return Array.isArray(data) ? data : Array.isArray(data.tracks) ? data.tracks : Array.isArray(data.items) ? data.items : [];
}

export async function fetchAdminMusicProviders(opts: AuthOpts): Promise<Record<string, boolean>> {
  const res = await authedFetch("/admin/music/providers", opts);
  const data = await requireOk(res, "Music providers failed");
  return (data.connected && typeof data.connected === "object" ? data.connected : {}) as Record<
    string,
    boolean
  >;
}

export async function connectAdminMusicProvider(
  body: { provider: string; apiKey: string },
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch("/admin/music/providers/connect", {
    ...opts,
    method: "POST",
    body,
  });
  await requireOk(res, "Connect music provider failed");
}

export async function disconnectAdminMusicProvider(
  body: { provider: string },
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch("/admin/music/providers/disconnect", {
    ...opts,
    method: "POST",
    body,
  });
  await requireOk(res, "Disconnect music provider failed");
}

export async function testAdminMusicProvider(
  body: { provider: string; apiKey?: string },
  opts: AuthOpts,
): Promise<{ ok?: boolean; message?: string }> {
  const res = await authedFetch("/admin/music/providers/test", {
    ...opts,
    method: "POST",
    body,
  });
  return requireOk(res, "Test music provider failed");
}

// ── Password-hash security tools ─────────────────────────────────────────────

export async function fetchPasswordHashStats(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/password-hash-stats", opts);
  return requireOk(res, "Password hash stats failed");
}

export async function postInvalidateSha256Passwords(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/invalidate-sha256-passwords", { ...opts, method: "POST", body: {} });
  return requireOk(res, "Invalidate SHA-256 passwords failed");
}

export async function postNotifyLegacyPasswordUsers(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/notify-legacy-password-users", { ...opts, method: "POST", body: {} });
  return requireOk(res, "Notify legacy password users failed");
}
