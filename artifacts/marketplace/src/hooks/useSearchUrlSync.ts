import { useEffect, useRef } from "react";

export type SearchUrlState = {
  q: string;
  category: string;
  subcategory: string;
  condition: string;
  city: string;
  minPrice: number;
  maxPrice: number;
  page: number;
};

const DEFAULT_MAX = 5000;

function readFromLocation(): SearchUrlState {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const min = Number(params.get("minPrice") ?? "0");
  const max = Number(params.get("maxPrice") ?? String(DEFAULT_MAX));
  const page = Number(params.get("page") ?? "1");
  return {
    q: params.get("q") ?? "",
    category: params.get("category") ?? "",
    subcategory: params.get("subcategory") ?? "",
    condition: params.get("condition") ?? "",
    city: params.get("city") ?? "",
    minPrice: Number.isFinite(min) && min >= 0 ? min : 0,
    maxPrice: Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX,
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

function buildSearch(state: SearchUrlState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.category) params.set("category", state.category);
  if (state.subcategory) params.set("subcategory", state.subcategory);
  if (state.condition) params.set("condition", state.condition);
  if (state.city.trim()) params.set("city", state.city.trim());
  if (state.minPrice > 0) params.set("minPrice", String(state.minPrice));
  if (state.maxPrice < DEFAULT_MAX) params.set("maxPrice", String(state.maxPrice));
  if (state.page > 1) params.set("page", String(state.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Keep Search filters shareable and back-button friendly without full reloads.
 * Uses history.replaceState so typing does not spam browser history.
 */
export function useSearchUrlSync(
  state: SearchUrlState,
  onPopState: (next: SearchUrlState) => void,
) {
  const onPopRef = useRef(onPopState);
  onPopRef.current = onPopState;
  const skipWrite = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    const next = `${window.location.pathname}${buildSearch(state)}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return;
    window.history.replaceState(window.history.state, "", next);
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      skipWrite.current = true;
      onPopRef.current(readFromLocation());
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
}

export function getInitialSearchUrlState(): SearchUrlState {
  if (typeof window === "undefined") {
    return {
      q: "",
      category: "",
      subcategory: "",
      condition: "",
      city: "",
      minPrice: 0,
      maxPrice: DEFAULT_MAX,
      page: 1,
    };
  }
  return readFromLocation();
}

export { DEFAULT_MAX as SEARCH_DEFAULT_MAX_PRICE };
