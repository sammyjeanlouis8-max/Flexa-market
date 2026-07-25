/**
 * Global Broadcast Context
 * - Polls /api/tv/broadcast every 5s (shared across the entire app)
 * - Sends viewer heartbeat every 30s
 * - Single source of truth for broadcast state so GlobalBroadcastPlayer
 *   can persist the iframe across route changes.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type PlaybackState = "playing" | "paused" | "stopped";

export interface BroadcastInfo {
  state: PlaybackState;
  programId: number | null;
  programTitle: string | null;
  videoUrl: string | null;
  videoKey: string | null;
  viewerCount: number;
}

const EMPTY: BroadcastInfo = {
  state: "stopped", programId: null, programTitle: null,
  videoUrl: null, videoKey: null, viewerCount: 0,
};

const BroadcastContext = createContext<BroadcastInfo>(EMPTY);

function getViewerId() {
  let id = sessionStorage.getItem("fxtv_viewer_id");
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("fxtv_viewer_id", id); }
  return id;
}

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [bs, setBs] = useState<BroadcastInfo>(EMPTY);

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

  // Heartbeat every 30s
  useEffect(() => {
    const viewerId = getViewerId();
    const hb = () =>
      fetch("/api/tv/broadcast/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId }),
      }).catch(() => {});
    hb();
    const t = setInterval(hb, 30_000);
    return () => clearInterval(t);
  }, []);

  return <BroadcastContext.Provider value={bs}>{children}</BroadcastContext.Provider>;
}

export function useBroadcast() {
  return useContext(BroadcastContext);
}
