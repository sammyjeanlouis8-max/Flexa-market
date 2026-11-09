import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { apiFetch } from "@/lib/api";
import { buildListingsQuery, type ListingsFilter } from "@/lib/listingsQuery";
import { useCallback, useEffect, useRef, useState } from "react";

export type ListingItem = {
  id: number;
  title?: string;
  price?: string | number;
  currency?: string;
  city?: string | null;
  location?: string | null;
  country?: string | null;
  images?: string[] | null;
  isBoosted?: boolean;
  category?: string;
  categorySlug?: string;
  condition?: string | null;
  description?: string;
  sellerName?: string | null;
  sellerRating?: number | null;
  sellerIsVerified?: boolean;
  favoriteCount?: number;
  viewCount?: number;
  isFavorited?: boolean;
  isOwner?: boolean;
  [key: string]: unknown;
};

type FeedState = {
  listings: ListingItem[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  offline: boolean;
};

export function useListingsFeed(baseFilter: Omit<ListingsFilter, "page" | "country">) {
  const { token, isLoading: authLoading } = useAuth();
  const { country, countryReady } = useMarketplace();
  const [state, setState] = useState<FeedState>({
    listings: [],
    total: 0,
    page: 1,
    totalPages: 0,
    loading: true,
    refreshing: false,
    loadingMore: false,
    error: null,
    offline: false,
  });
  const pageRef = useRef(1);
  const totalPagesRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const filterKey = JSON.stringify(baseFilter);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "more" = "initial") => {
      if (!countryReady) return;
      if (mode === "more") {
        if (loadingMoreRef.current || pageRef.current >= totalPagesRef.current) return;
        loadingMoreRef.current = true;
      }
      setState((prev) => ({
        ...prev,
        loading: mode === "initial",
        refreshing: mode === "refresh",
        loadingMore: mode === "more",
        error: mode === "more" ? prev.error : null,
      }));
      try {
        const nextPage = mode === "more" ? pageRef.current + 1 : 1;
        const parsed = JSON.parse(filterKey) as Omit<ListingsFilter, "page" | "country">;
        const qs = buildListingsQuery(
          {
            ...parsed,
            country,
            page: nextPage,
            limit: parsed.limit ?? 20,
          },
          { guest: !token },
        );
        const res = await apiFetch(`/listings?${qs}`, {
          token,
          auth: Boolean(token),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load listings (${res.status})`);
        }
        const data = await res.json();
        const rows: ListingItem[] = Array.isArray(data.listings) ? data.listings : [];
        const page = typeof data.page === "number" ? data.page : nextPage;
        const totalPages = typeof data.totalPages === "number" ? data.totalPages : 1;
        pageRef.current = page;
        totalPagesRef.current = totalPages;
        setState((prev) => ({
          listings: mode === "more" ? [...prev.listings, ...rows] : rows,
          total: typeof data.total === "number" ? data.total : rows.length,
          page,
          totalPages,
          loading: false,
          refreshing: false,
          loadingMore: false,
          error: null,
          offline: false,
        }));
      } catch (e: any) {
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          loadingMore: false,
          error: e?.message || "Could not load marketplace feed.",
          offline: true,
          listings: mode === "more" ? prev.listings : [],
        }));
      } finally {
        loadingMoreRef.current = false;
      }
    },
    [country, countryReady, filterKey, token],
  );

  useEffect(() => {
    if (!authLoading && countryReady) void load("initial");
  }, [authLoading, countryReady, load]);

  return {
    ...state,
    ready: countryReady && !authLoading,
    reload: () => load("initial"),
    refresh: () => load("refresh"),
    loadMore: () => {
      void load("more");
    },
  };
}
