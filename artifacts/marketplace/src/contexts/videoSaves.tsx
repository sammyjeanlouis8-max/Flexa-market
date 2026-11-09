import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/auth";

type VideoSavesCtx = {
  isSaved: (id: number) => boolean;
  markSaved: (id: number) => void;
  markUnsaved: (id: number) => void;
  refresh: () => void;
};

const VideoSavesContext = createContext<VideoSavesCtx>({
  isSaved: () => false,
  markSaved: () => {},
  markUnsaved: () => {},
  refresh: () => {},
});

export function VideoSavesProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [ids, setIds] = useState<Set<number>>(new Set());

  const refresh = useCallback(() => {
    if (!user || !token) {
      setIds(new Set());
      return;
    }
    fetch("/api/video-saves/ids", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.ids) return;
        setIds(new Set((data.ids as number[]).filter((n) => Number.isFinite(n))));
      })
      .catch(() => {});
  }, [user, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isSaved = useCallback((id: number) => ids.has(id), [ids]);

  const markSaved = useCallback((id: number) => {
    setIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markUnsaved = useCallback((id: number) => {
    setIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return (
    <VideoSavesContext.Provider value={{ isSaved, markSaved, markUnsaved, refresh }}>
      {children}
    </VideoSavesContext.Provider>
  );
}

export function useVideoSaves() {
  return useContext(VideoSavesContext);
}
