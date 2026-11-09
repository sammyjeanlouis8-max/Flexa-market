import { useAuth } from "@/context/AuthContext";
import {
  apiFetch,
  getMarketplaceCountry,
  setMarketplaceCountry,
  type CategoryNode,
} from "@/lib/api";
import { DEFAULT_MARKETPLACE_COUNTRY, normalizeMarketplaceCountry } from "@/lib/countries";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";

type MarketplaceContextType = {
  country: string;
  countryReady: boolean;
  setCountry: (country: string) => Promise<void>;
  categories: CategoryNode[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  refreshCategories: () => Promise<void>;
  isOffline: boolean;
};

const MarketplaceContext = createContext<MarketplaceContextType>({
  country: DEFAULT_MARKETPLACE_COUNTRY,
  countryReady: false,
  setCountry: async () => {},
  categories: [],
  categoriesLoading: false,
  categoriesError: null,
  refreshCategories: async () => {},
  isOffline: false,
});

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const { token, user, refreshUser } = useAuth();
  const [country, setCountryState] = useState(DEFAULT_MARKETPLACE_COUNTRY);
  const [countryReady, setCountryReady] = useState(false);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getMarketplaceCountry();
      if (cancelled) return;
      // Prefer authenticated profile country when present (server gate).
      if (user?.country) {
        const normalized = normalizeMarketplaceCountry(user.country);
        setCountryState(normalized);
        await setMarketplaceCountry(normalized);
      } else {
        setCountryState(stored);
      }
      setCountryReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.country]);

  const setCountry = useCallback(
    async (next: string) => {
      const normalized = await setMarketplaceCountry(next);
      setCountryState(normalized);
      // First-time onboarding for authed users without a country.
      if (token && user && !user.country) {
        try {
          const res = await apiFetch("/me/country", {
            method: "PATCH",
            token,
            body: JSON.stringify({ country: normalized }),
          });
          if (res.ok) await refreshUser();
        } catch {
          /* local country still applies for guest-style browsing until sync */
        }
      }
    },
    [token, user, refreshUser],
  );

  const refreshCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const res = await apiFetch("/categories");
      if (!res.ok) throw new Error(`Categories unavailable (${res.status})`);
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
      setIsOffline(false);
    } catch (e: any) {
      setCategoriesError(e?.message || "Could not load categories.");
      setIsOffline(true);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCategories();
  }, [refreshCategories]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshCategories();
    });
    return () => sub.remove();
  }, [refreshCategories]);

  const value = useMemo(
    () => ({
      country,
      countryReady,
      setCountry,
      categories,
      categoriesLoading,
      categoriesError,
      refreshCategories,
      isOffline,
    }),
    [
      country,
      countryReady,
      setCountry,
      categories,
      categoriesLoading,
      categoriesError,
      refreshCategories,
      isOffline,
    ],
  );

  return (
    <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>
  );
}

export const useMarketplace = () => useContext(MarketplaceContext);
