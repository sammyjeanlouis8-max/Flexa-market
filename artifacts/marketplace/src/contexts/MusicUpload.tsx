/**
 * MusicUploadContext — global background upload manager
 *
 * Uploads files DIRECTLY to Cloudinary (browser → Cloudinary, not via server)
 * to avoid DigitalOcean's 30-second request timeout on large audio files.
 *
 * Flow:
 *   1. GET /api/music/upload-signature  (fast, <1s)
 *   2. XHR audio → Cloudinary /video/upload  (progress tracked, 0–85%)
 *   3. fetch cover → Cloudinary /image/upload  (85–95%)
 *   4. POST /api/music/register  (DB insert only, <1s)
 *
 * Lives at the App root so uploads survive page navigation.
 */
import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { CheckCircle, AlertCircle, Music2, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

// ── Types ──────────────────────────────────────────────────────────────────────
export type UploadStatus = "idle" | "uploading" | "done" | "error";

export interface UploadState {
  status:       UploadStatus;
  progress:     number;       // 0–100
  title:        string;
  artist:       string;
  coverPreview: string | null;
  error:        string | null;
  track:        any | null;
}

export interface UploadMeta {
  title:             string;
  artist:            string;
  album?:            string;
  genre?:            string;
  type?:             string;
  monetizationType?: string;  // "stream" | "sale"
  priceUsd?:         number;  // set when monetizationType === "sale"
  coverPreview?:     string;
  lyrics?:           string;
}

interface MusicUploadCtx {
  state:   UploadState;
  /**
   * Start a direct-to-Cloudinary upload.
   * audioFile is required; coverFile is optional.
   * onPlanRequired is called (with songCount) when the free limit is hit —
   * the caller should redirect to the Plan Artis upgrade screen.
   */
  start:   (audioFile: File, coverFile: File | null, meta: UploadMeta,
            onDone?: (track: any) => void,
            onPlanRequired?: (songCount: number) => void) => void;
  dismiss: () => void;
}

// ── Defaults ───────────────────────────────────────────────────────────────────
const IDLE: UploadState = {
  status: "idle", progress: 0, title: "", artist: "",
  coverPreview: null, error: null, track: null,
};

const MusicUploadContext = createContext<MusicUploadCtx>({
  state:   IDLE,
  start:   () => {},
  dismiss: () => {},
});

// ── Cloudinary direct-upload helper ───────────────────────────────────────────
interface CldSig {
  cloudName: string;
  apiKey:    string;
  timestamp: number;
  audio: { folder: string; signature: string };
  cover: { folder: string; signature: string; format: string };
}

/** Upload a file directly to Cloudinary via XHR with progress events. */
function uploadToCloudinary(
  file: File,
  resourceType: "video" | "image",
  sig: CldSig,
  params: { folder: string; signature: string; format?: string },
  onProgress?: (pct: number) => void,
): Promise<{ publicId: string; secureUrl: string }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file",      file);
    fd.append("api_key",   sig.apiKey);
    fd.append("timestamp", String(sig.timestamp));
    fd.append("signature", params.signature);
    fd.append("folder",    params.folder);
    if (params.format) fd.append("format", params.format);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`);

    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve({ publicId: data.public_id, secureUrl: data.secure_url });
      } else {
        let msg = `Cloudinary HTTP ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch { /* ignore */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Cloudinary network error"));
    xhr.send(fd);
  });
}

// ── Provider ───────────────────────────────────────────────────────────────────
export function MusicUploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>(IDLE);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const doneRef  = useRef<((track: any) => void) | null>(null);

  const dismiss = useCallback(() => setState(IDLE), []);

  const start = useCallback((
    audioFile: File,
    coverFile: File | null,
    meta:      UploadMeta,
    onDone?:   (track: any) => void,
    onPlanRequired?: (songCount: number) => void,
  ) => {
    // Cancel any in-flight upload
    abortRef.current?.abort();
    doneRef.current = onDone ?? null;

    setState({
      status: "uploading", progress: 0,
      title: meta.title, artist: meta.artist,
      coverPreview: meta.coverPreview ?? null,
      error: null, track: null,
    });

    const token = localStorage.getItem("flexamarket_token");

    const run = async () => {
      // ── Step 0: Pre-check plan limit BEFORE wasting Cloudinary bandwidth ──
      try {
        const planRes = await fetch("/api/music/artist/plan", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (planRes.ok) {
          const pd = await planRes.json();
          if (!pd.isArtistPlan && pd.songCount >= pd.freeSongLimit) {
            setState(IDLE);
            onPlanRequired?.(pd.songCount);
            return;
          }
        }
      } catch { /* ignore — backend enforces at register step */ }

      // ── Step 1: Get Cloudinary signature ──────────────────────────────────
      const sigRes = await fetch("/api/music/upload-signature", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!sigRes.ok) {
        const d = await sigRes.json().catch(() => ({}));
        throw new Error(d.error ?? `Signature HTTP ${sigRes.status}`);
      }
      const sig: CldSig = await sigRes.json();

      // ── Step 2: Upload audio to Cloudinary (progress 0→85) ───────────────
      const audio = await uploadToCloudinary(
        audioFile, "video", sig, sig.audio,
        (pct) => setState(s => ({ ...s, progress: Math.round(pct * 0.85) })),
      );

      // ── Step 3: Upload cover to Cloudinary (progress 85→95) ──────────────
      let cover: { publicId: string; secureUrl: string } | null = null;
      if (coverFile) {
        setState(s => ({ ...s, progress: 85 }));
        try {
          cover = await uploadToCloudinary(coverFile, "image", sig, sig.cover);
        } catch (err: any) {
          console.warn("[upload] cover upload failed — continuing without cover", err.message);
        }
      }

      // ── Step 4: Register in DB ────────────────────────────────────────────
      setState(s => ({ ...s, progress: 95 }));
      const regRes = await fetch("/api/music/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title:             meta.title,
          artist:            meta.artist,
          album:             meta.album ?? "",
          genre:             meta.genre ?? "",
          type:              meta.type ?? "free",
          monetization_type: meta.monetizationType ?? "stream",
          price_usd:         meta.priceUsd ?? null,
          audioPublicId:     audio.publicId,
          audioUrl:          audio.secureUrl,
          coverPublicId:     cover?.publicId ?? null,
          coverUrl:          cover?.secureUrl ?? null,
          lyrics:            meta.lyrics ?? null,
        }),
      });
      if (!regRes.ok) {
        const d = await regRes.json().catch(() => ({}));
        // Clean up orphaned Cloudinary files — registration failed after upload
        fetch("/api/music/cleanup-orphan", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ audioPublicId: audio.publicId, coverPublicId: cover?.publicId ?? null }),
        }).catch(() => {}); // best-effort, do not block error path
        if (d.error === "ARTIST_PLAN_REQUIRED") {
          setState(IDLE);
          onPlanRequired?.(d.count ?? 0);
          return;
        }
        throw new Error(d.error ?? `Register HTTP ${regRes.status}`);
      }
      const { track } = await regRes.json();

      setState(s => ({ ...s, status: "done", progress: 100, track }));
      doneRef.current?.(track);
      setTimeout(() => setState(IDLE), 8_000);
    };

    run().catch((err: Error) => {
      console.error("[upload] FAILED:", err.message);
      const isNetwork = err.message.toLowerCase().includes("network");
      setState(s => ({
        ...s, status: "error",
        error: isNetwork ? "__networkError__" : err.message,
      }));
    });
  }, []);

  return (
    <MusicUploadContext.Provider value={{ state, start, dismiss }}>
      {children}
      <FloatingUploadToast state={state} onDismiss={dismiss} />
    </MusicUploadContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useMusicUpload() {
  return useContext(MusicUploadContext);
}

// ── Floating toast ─────────────────────────────────────────────────────────────
function FloatingUploadToast({
  state, onDismiss,
}: { state: UploadState; onDismiss: () => void }) {
  const { t } = useTranslation();
  if (state.status === "idle") return null;

  const isUploading = state.status === "uploading";
  const isDone      = state.status === "done";
  const isError     = state.status === "error";

  const errorText = state.error === "__networkError__" ? t("uploadCtx.networkError")
                  : state.error === "__serverError__"  ? t("uploadCtx.serverError")
                  : state.error ?? "";

  const borderColor = isDone  ? "rgba(34,197,94,0.4)"
                    : isError ? "rgba(239,68,68,0.4)"
                    : "rgba(124,58,237,0.4)";

  return (
    <div
      style={{
        position:     "fixed",
        bottom:       80,
        left:         12,
        right:        12,
        zIndex:       9999,
        background:   "#111",
        border:       `1px solid ${borderColor}`,
        borderRadius: 16,
        padding:      "12px 14px",
        boxShadow:    "0 8px 32px rgba(0,0,0,0.6)",
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        animation:    "slideUp 0.25s ease",
      }}
    >
      {/* Cover / icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 10, overflow: "hidden",
        flexShrink: 0, background: "#1a1a1a",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {state.coverPreview
          ? <img src={state.coverPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : isDone
            ? <CheckCircle size={22} style={{ color: "#22c55e" }} />
            : isError
              ? <AlertCircle size={22} style={{ color: "#ef4444" }} />
              : <Music2 size={22} style={{ color: "#a855f7" }} />
        }
      </div>

      {/* Text + progress */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {isDone  ? t("uploadCtx.done") :
           isError ? t("uploadCtx.failed") :
           `${state.title} · ${state.artist}`}
        </p>
        {isUploading && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between",
                          fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                {t("uploadCtx.uploading")}
              </span>
              <span>{state.progress}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "#222", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${state.progress}%`,
                background: "linear-gradient(90deg,#7c3aed,#c026d3)",
                transition: "width 0.3s ease",
              }} />
            </div>
          </>
        )}
        {isDone && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {state.title} · {t("uploadCtx.pendingReview")}
          </p>
        )}
        {isError && (
          <p style={{ fontSize: 11, color: "rgba(239,68,68,0.7)" }}>{errorText}</p>
        )}
      </div>

      {/* Dismiss — only when not actively uploading */}
      {!isUploading && (
        <button onClick={onDismiss}
          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X size={16} style={{ color: "rgba(255,255,255,0.4)" }} />
        </button>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
