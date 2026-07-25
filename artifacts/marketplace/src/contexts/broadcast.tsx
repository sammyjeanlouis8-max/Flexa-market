/**
 * Global Broadcast Context
 * - Polls /api/tv/broadcast every 5s (shared across the entire app)
 * - Sends viewer heartbeat every 15s
 * - Exposes `dismissed` / `setDismissed` so FlexaTV's on/off button and
 *   GlobalBroadcastPlayer share the same toggle state.
 */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

export type PlaybackState = "playing" | "paused" | "stopped";

export interface BroadcastInfo {
  state: PlaybackState;
  programId: number | null;
  programTitle: string | null;
  videoUrl: string | null;
  videoKey: string | null;
  viewerCount: number;
  startedAt: string | null;
  // Player on/off toggle (viewer preference, session-scoped)
  dismissed: boolean;
  setDismissed: (v: boolean) => void;
}

const EMPTY: BroadcastInfo = {
  state: "stopped", programId: null, programTitle: null,
  videoUrl: null, videoKey: null, viewerCount: 0, startedAt: null,
  dismissed: false, setDismissed: () => {},
};

const BroadcastContext = createContext<BroadcastInfo>(EMPTY);

function getViewerId() {
  let id = sessionStorage.getItem("fxtv_viewer_id");
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("fxtv_viewer_id", id); }
  return id;
}

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [bs, setBs] = useState<Omit<BroadcastInfo, "dismissed" | "setDismissed">>({
    state: "stopped", programId: null, programTitle: null,
    videoUrl: null, videoKey: null, viewerCount: 0, startedAt: null,
  });
  const [dismissed, setDismissedRaw] = useState(false);

  // Auto-un-dismiss when a new broadcast starts (state goes stopped → playing)
  const prevState = useState(bs.state);
  useEffect(() => {
    if (bs.state === "playing" && prevState[0] === "stopped") setDismissedRaw(false);
    prevState[1](bs.state); // eslint-disable-line
  }, [bs.state]); // eslint-disable-line

  const setDismissed = useCallback((v: boolean) => setDismissedRaw(v), []);

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
    <BroadcastContext.Provider value={{ ...bs, dismissed, setDismissed }}>
      {children}
    </BroadcastContext.Provider>
  );
}

export function useBroadcast() {
  return useContext(BroadcastContext);
}
