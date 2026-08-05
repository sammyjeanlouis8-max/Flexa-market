/**
 * Global Broadcast Context
 * - Polls /api/tv/broadcast every 5s (shared across the entire app)
 * - Sends viewer heartbeat every 15s
 * - Exposes `dismissed` / `setDismissed` so FlexaTV's on/off button and
 *   GlobalBroadcastPlayer share the same toggle state.
 */
import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";

export type PlaybackState = "playing" | "paused" | "stopped";

/** Film the user started watching — persists across navigation for mini-player hand-off */
export type FilmEntry = {
  videoUrl: string | null;
  videoKey: string | null;
  title: string;
  description: string | null;
  type: string;
  programId: number;
  thumbnailUrl: string | null;
};

export interface BroadcastInfo {
  state: PlaybackState;
  programId: number | null;
  programTitle: string | null;
  videoUrl: string | null;
  videoKey: string | null;
  viewerCount: number;
  startedAt: string | null;
  // Broadcast on/off toggle (viewer preference, session-scoped)
  dismissed: boolean;
  setDismissed: (v: boolean) => void;
  // Film player — persists when user navigates away from /tv so mini-player can continue
  filmPlayer: FilmEntry | null;
  setFilmPlayer: (f: FilmEntry | null) => void;
}

const EMPTY: BroadcastInfo = {
  state: "stopped", programId: null, programTitle: null,
  videoUrl: null, videoKey: null, viewerCount: 0, startedAt: null,
  dismissed: false, setDismissed: () => {},
  filmPlayer: null, setFilmPlayer: () => {},
};

const BroadcastContext = createContext<BroadcastInfo>(EMPTY);

function getViewerId() {
  let id = sessionStorage.getItem("fxtv_viewer_id");
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("fxtv_viewer_id", id); }
  return id;
}

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [bs, setBs] = useState<Omit<BroadcastInfo, "dismissed" | "setDismissed" | "filmPlayer" | "setFilmPlayer">>({
    state: "stopped", programId: null, programTitle: null,
    videoUrl: null, videoKey: null, viewerCount: 0, startedAt: null,
  });
  const [dismissed, setDismissedRaw] = useState(false);
  const [filmPlayer, setFilmPlayerRaw] = useState<FilmEntry | null>(null);
  const setFilmPlayer = useCallback((f: FilmEntry | null) => setFilmPlayerRaw(f), []);
  // Track WHICH program was dismissed so we only auto-un-dismiss on a NEW broadcast.
  // Without this, every 5-second poll re-fires the state effect and can reset dismissed.
  const dismissedProgramRef = useRef<number | null>(null);

  // Auto-un-dismiss ONLY when a genuinely new broadcast starts (different programId)
  const prevStateRef = useRef(bs.state);
  useEffect(() => {
    const isNewBroadcast =
      bs.state === "playing" &&
      (prevStateRef.current === "stopped" ||
        // Different program than the one the user dismissed
        (bs.programId !== null && bs.programId !== dismissedProgramRef.current));
    if (isNewBroadcast) {
      dismissedProgramRef.current = null;
      setDismissedRaw(false);
    }
    prevStateRef.current = bs.state;
  }, [bs.state, bs.programId]);

  const setDismissed = useCallback((v: boolean) => {
    // Remember which program was dismissed so auto-un-dismiss only triggers on a NEW one
    if (v) dismissedProgramRef.current = bs.programId;
    setDismissedRaw(v);
  }, [bs.programId]);

  // Poll every 5s
  useEffect(() => {
    const poll = () =>
      fetch("/api/tv/broadcast")
        .then(r => r.json())
        .then(d => { if (d.broadcast) setBs(d.broadcast); })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 5_000);
    return () => clearInterval(t);
  }, []);

  // Heartbeat every 15s
  useEffect(() => {
    const viewerId = getViewerId();
    const hb = () =>
      fetch("/api/tv/broadcast/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId }),
      }).catch(() => {});
    hb();
    const t = setInterval(hb, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <BroadcastContext.Provider value={{ ...bs, dismissed, setDismissed, filmPlayer, setFilmPlayer }}>
      {children}
    </BroadcastContext.Provider>
  );
}

export function useBroadcast() {
  return useContext(BroadcastContext);
}
