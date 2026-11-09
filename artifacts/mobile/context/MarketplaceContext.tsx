import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";

const COUNTRY_KEY = "flexamarket_marketplace_country";
const DEFAULT_COUNTRY = "Haiti";

type MarketplaceContextType = {
  country: string;
  setCountry: (country: string) => Promise<void>;
  isReady: boolean;
};

const MarketplaceContext = createContext<MarketplaceContextType>({
  country: DEFAULT_COUNTRY,
  setCountry: async () => {},
  isReady: false,
});

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [country, setCountryState] = useState(DEFAULT_COUNTRY);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(COUNTRY_KEY);
        if (!cancelled && stored) setCountryState(stored);
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Authenticated users with a profile country win over guest preference.
  useEffect(() => {
    if (user?.country) setCountryState(user.country);
  }, [user?.country]);

  const setCountry = useCallback(async (next: string) => {
    setCountryState(next);
    try {
      await AsyncStorage.setItem(COUNTRY_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ country, setCountry, isReady }),
    [country, setCountry, isReady],
  );

  return (
    <MarketplaceContext.Provider value={value}>
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  return useContext(MarketplaceContext);
}
