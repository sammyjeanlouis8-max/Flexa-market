/**
 * MusicUploadContext — global background upload manager
 *
 * Lives at the App root so uploads survive page navigation.
 * A floating toast shows real-time progress from anywhere in the app.
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
  track:        any | null;   // Track returned by API on success
}

interface MusicUploadCtx {
  state:   UploadState;
  /** Start an upload. Pass a ready FormData + display meta + optional done callback. */
  start:   (fd: FormData, meta: { title: string; artist: string; coverPreview?: string },
            onDone?: (track: any) => void) => void;
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

// ── Provider ───────────────────────────────────────────────────────────────────
export function MusicUploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>(IDLE);
  const xhrRef   = useRef<XMLHttpRequest | null>(null);
  const doneRef  = useRef<((track: any) => void) | null>(null);

  const dismiss = useCallback(() => setState(IDLE), []);

  const start = useCallback((
    fd:   FormData,
    meta: { title: string; artist: string; coverPreview?: string },
    onDone?: (track: any) => void,
  ) => {
    // Abort any in-flight upload
    xhrRef.current?.abort();
    doneRef.current = onDone ?? null;

    setState({
      status: "uploading", progress: 0,
      title: meta.title, artist: meta.artist,
      coverPreview: meta.coverPreview ?? null,
      error: null, track: null,
    });

    console.log("[upload] step 1: file(s) selected, starting upload pipeline", {
      title: meta.title, artist: meta.artist,
    });

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/music/upload");
    // Attach JWT — backend uses Bearer token auth; missing header causes
    // a 401 mid-stream which closes the TCP connection and fires onerror.
    const token = localStorage.getItem("flexamarket_token");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 92);
        console.log(`[upload] step 7: upload progress ${pct}% (${ev.loaded}/${ev.total} bytes)`);
        setState(s => ({ ...s, progress: pct }));
      }
    };

    xhr.onload = () => {
      setState(s => ({ ...s, progress: 100 }));
      console.log(`[upload] server responded — HTTP ${xhr.status}`, xhr.responseText.slice(0, 300));

      if (xhr.status === 201) {
        let data: any = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* raw text already logged */ }
        console.log("[upload] step 10: success", { trackId: data.track?.id, uploadId: data.uploadId });
        setState(s => ({ ...s, status: "done", track: data.track ?? null }));
        doneRef.current?.(data.track);
        setTimeout(() => setState(IDLE), 8_000);
      } else {
        let parsed: any = {};
        try { parsed = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        // Build a rich error string: include step name if server sent it
        const serverMsg  = parsed?.error ?? parsed?.message ?? xhr.responseText.slice(0, 200) ?? "__serverError__";
        const stepName   = parsed?.stepName ? ` [${parsed.stepName}]` : "";
        const uploadId   = parsed?.uploadId ? ` (ID: ${parsed.uploadId})` : "";
        const richMsg    = `HTTP ${xhr.status}${stepName}: ${serverMsg}${uploadId}`;
        console.error("[upload] FAILED:", richMsg, parsed);
        setState(s => ({ ...s, status: "error", error: richMsg }));
      }
    };

    xhr.onerror = () => {
      console.error("[upload] network error (xhr.onerror)");
      setState(s => ({ ...s, status: "error", error: "__networkError__" }));
    };
    xhr.onabort  = () => setState(IDLE);
    xhr.send(fd);
    console.log("[upload] step 2: request sent to /api/music/upload");
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

  // Translate sentinel error codes; pass server messages through as-is
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
        bottom:       80,          // above bottom nav
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
