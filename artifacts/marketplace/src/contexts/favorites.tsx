import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/auth";
import { apiFetch } from "@/lib/api";

type FavoritesCtx = {
  isFavorited: (id: number) => boolean;
  markFavorited: (id: number) => void;
  markUnfavorited: (id: number) => void;
};

const FavoritesContext = createContext<FavoritesCtx>({
  isFavorited: () => false,
  markFavorited: () => {},
  markUnfavorited: () => {},
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) { setIds(new Set()); return; }
    apiFetch<{ id: number }[]>("/api/favorites")
      .then((listings) => setIds(new Set(listings.map((l) => l.id))))
      .catch(() => {});
  }, [user?.id]);

  const isFavorited = useCallback((id: number) => ids.has(id), [ids]);

  const markFavorited = useCallback((id: number) => {
    setIds((prev) => { const next = new Set(prev); next.add(id); return next; });
  }, []);

  const markUnfavorited = useCallback((id: number) => {
    setIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  return (
    <FavoritesContext.Provider value={{ isFavorited, markFavorited, markUnfavorited }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
