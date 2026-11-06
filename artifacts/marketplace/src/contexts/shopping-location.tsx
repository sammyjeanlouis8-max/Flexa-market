import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/auth";
import {
  applyDetectedShoppingLocation,
  readShoppingLocation,
  setManualShoppingCity,
  setManualShoppingCountry,
  type ShoppingLocation,
} from "@/lib/shoppingLocation";

type ShoppingLocationContextValue = {
  /** Effective marketplace country for discovery (profile for users, guest store for visitors). */
  country: string | undefined;
  city: string | null;
  /** Guest-only store; null when logged in. */
  guestLocation: ShoppingLocation | null;
  detecting: boolean;
  setGuestCountry: (country: string, city?: string | null) => void;
  setGuestCity: (city: string) => void;
  refreshDetection: () => Promise<void>;
};

const ShoppingLocationContext = createContext<ShoppingLocationContextValue>({
  country: undefined,
  city: null,
  guestLocation: null,
  detecting: false,
  setGuestCountry: () => {},
  setGuestCity: () => {},
  refreshDetection: async () => {},
});

export function ShoppingLocationProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [guestLocation, setGuestLocation] = useState<ShoppingLocation | null>(() =>
    typeof window !== "undefined" ? readShoppingLocation() : null,
  );
  const [detecting, setDetecting] = useState(false);

  const refreshDetection = useCallback(async () => {
    if (user) return;
    const existing = readShoppingLocation();
    if (existing?.manual) {
      setGuestLocation(existing);
      return;
    }
    setDetecting(true);
    try {
      const res = await fetch("/api/auth/detect-country", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        country?: string | null;
        city?: string | null;
      };
      const applied = applyDetectedShoppingLocation({
        country: data.country,
        city: data.city,
      });
      if (applied) setGuestLocation(applied);
      else setGuestLocation(readShoppingLocation());
    } catch {
      setGuestLocation(readShoppingLocation());
    } finally {
      setDetecting(false);
    }
  }, [user]);

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      setGuestLocation(null);
      return;
    }
    const existing = readShoppingLocation();
    if (existing) {
      setGuestLocation(existing);
      if (existing.manual) return;
    }
    void refreshDetection();
  }, [user, isLoading, refreshDetection]);

  const setGuestCountry = useCallback((country: string, city: string | null = null) => {
    const next = setManualShoppingCountry(country, city);
    if (next) setGuestLocation(next);
  }, []);

  const setGuestCity = useCallback((city: string) => {
    const next = setManualShoppingCity(city);
    if (next) setGuestLocation(next);
  }, []);

  const value = useMemo<ShoppingLocationContextValue>(() => {
    if (user) {
      return {
        country: user.country ?? undefined,
        city: user.location ?? null,
        guestLocation: null,
        detecting: false,
        setGuestCountry,
        setGuestCity,
        refreshDetection,
      };
    }
    return {
      country: guestLocation?.country,
      city: guestLocation?.city ?? null,
      guestLocation,
      detecting,
      setGuestCountry,
      setGuestCity,
      refreshDetection,
    };
  }, [user, guestLocation, detecting, setGuestCountry, setGuestCity, refreshDetection]);

  return (
    <ShoppingLocationContext.Provider value={value}>
      {children}
    </ShoppingLocationContext.Provider>
  );
}

export function useShoppingLocation() {
  return useContext(ShoppingLocationContext);
}
