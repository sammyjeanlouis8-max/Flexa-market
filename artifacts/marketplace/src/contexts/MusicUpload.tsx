/**
 * MusicUploadContext — global background upload manager
 *
 * Lives at the App root so uploads survive page navigation.
 * A floating toast shows real-time progress from anywhere in the app.
 */
import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { CheckCircle, AlertCircle, Music2, X, Loader2 } from "lucide-react";

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

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/music/upload");

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        setState(s => ({ ...s, progress: Math.round((ev.loaded / ev.total) * 92) }));
      }
    };

    xhr.onload = () => {
      setState(s => ({ ...s, progress: 100 }));
      if (xhr.status === 201) {
        const data = JSON.parse(xhr.responseText);
        const track = data.track;
        setState(s => ({ ...s, status: "done", track }));
        doneRef.current?.(track);
        // Auto-dismiss toast after 8 s
        setTimeout(() => setState(IDLE), 8_000);
      } else {
        let msg = "Erè pandan telechajman";
        try { msg = JSON.parse(xhr.responseText)?.error ?? msg; } catch {}
        setState(s => ({ ...s, status: "error", error: msg }));
      }
    };

    xhr.onerror  = () => setState(s => ({ ...s, status: "error", error: "Erè rezo — eseye ankò" }));
    xhr.onabort  = () => setState(IDLE);
    xhr.send(fd);
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
  if (state.status === "idle") return null;

  const isUploading = state.status === "uploading";
  const isDone      = state.status === "done";
  const isError     = state.status === "error";

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
          {isDone  ? "✅ Telechajman reyisi!" :
           isError ? "❌ Telechajman echwe" :
           `${state.title} · ${state.artist}`}
        </p>
        {isUploading && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between",
                          fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                Ap telechaje sou Wasabi…
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
            {state.title} · Ap tann revizyon admin
          </p>
        )}
        {isError && (
          <p style={{ fontSize: 11, color: "rgba(239,68,68,0.7)" }}>{state.error}</p>
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
