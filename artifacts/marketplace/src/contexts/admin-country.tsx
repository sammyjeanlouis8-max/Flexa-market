/**
 * Centralized admin country selection for Super Admin / multi-country admins.
 *
 * - null selectedCountry = "All Countries" (authorized union / worldwide)
 * - Specific country = filter marketplace + promotional videos to that country
 * - Never mutates the admin's registered account country / identity
 * - Persists across navigation; clamps to authorized set when role changes
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import {
  adminVideoFeedParamsKey,
  buildAdminVideoFeedParams,
  canAdminSelectAllCountries,
  getAdminSelectableCountries,
  isAdminUser,
  isGlobalCountryAdmin,
  isMultiCountryAdmin,
  isSuperAdminUser,
  parseAdminScopeCountriesList,
  resolveEffectiveAdminCountry,
  shouldShowAdminCountryFlags,
  type ScopeUser,
} from "@/lib/adminCountryAccess";

export const ADMIN_COUNTRY_STORAGE_KEY = "flexamarket_admin_country";

type AdminCountryContextValue = {
  /** Raw picker value — null means All Countries when allowed. */
  selectedCountry: string | null;
  setSelectedCountry: (country: string | null) => void;
  /** Country used for marketplace / promo API filters. */
  effectiveCountry: string | null;
  /** Countries shown in the picker (empty for SA/global → use SUPPORTED_COUNTRIES). */
  selectableCountries: string[];
  pickerCountries: string[];
  canSelectAll: boolean;
  showCountryFlags: boolean;
  isAdminViewer: boolean;
  isSuperAdmin: boolean;
  isGlobalAdmin: boolean;
  isMultiCountryAdmin: boolean;
  /** Params to append to /api/videos/feed. */
  videoFeedParams: { country?: string; allCountries?: "1" };
};

const AdminCountryContext = createContext<AdminCountryContextValue>({
  selectedCountry: null,
  setSelectedCountry: () => {},
  effectiveCountry: null,
  selectableCountries: [],
  pickerCountries: [],
  canSelectAll: false,
  showCountryFlags: false,
  isAdminViewer: false,
  isSuperAdmin: false,
  isGlobalAdmin: false,
  isMultiCountryAdmin: false,
  videoFeedParams: {},
});

function readStoredCountry(): string | null {
  try {
    const raw = localStorage.getItem(ADMIN_COUNTRY_STORAGE_KEY);
    if (!raw || raw === "all" || raw === "null") return null;
    return raw;
  } catch {
    return null;
  }
}

function writeStoredCountry(country: string | null) {
  try {
    if (country) localStorage.setItem(ADMIN_COUNTRY_STORAGE_KEY, country);
    else localStorage.setItem(ADMIN_COUNTRY_STORAGE_KEY, "all");
  } catch { /* ok */ }
}

/** Clamp a stored/selected value to what this admin may view. */
function clampSelection(user: ScopeUser, selected: string | null): string | null {
  if (!isAdminUser(user)) return null;
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) {
    if (!selected) return null;
    const match = SUPPORTED_COUNTRIES.find(c => c.toLowerCase() === selected.toLowerCase());
    return match ?? null;
  }
  const assigned = parseAdminScopeCountriesList(user);
  if (assigned.length <= 1) return assigned[0] ?? null;
  if (!selected) return null;
  return assigned.find(c => c.toLowerCase() === selected.toLowerCase()) ?? null;
}

export function AdminCountryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCountry, setSelectedCountryState] = useState<string | null>(() =>
    typeof window !== "undefined" ? readStoredCountry() : null,
  );

  const isSuperAdmin = isSuperAdminUser(user);
  const isGlobalAdmin = isGlobalCountryAdmin(user);
  const isMulti = isMultiCountryAdmin(user);
  const isAdminViewer = isAdminUser(user);
  const canSelectAll = canAdminSelectAllCountries(user);
  const selectableCountries = getAdminSelectableCountries(user);
  const pickerCountries = useMemo(() => {
    if (!isAdminViewer) return [];
    if (isSuperAdmin || isGlobalAdmin) return [...SUPPORTED_COUNTRIES];
    return selectableCountries;
  }, [isAdminViewer, isSuperAdmin, isGlobalAdmin, selectableCountries]);

  // Clamp when auth/role scope changes (never leave an unauthorized country).
  useEffect(() => {
    if (!isAdminViewer) return;
    const clamped = clampSelection(user, selectedCountry);
    if (clamped !== selectedCountry) {
      setSelectedCountryState(clamped);
      writeStoredCountry(clamped);
    }
  }, [user, isAdminViewer, selectedCountry]);

  const setSelectedCountry = useCallback((country: string | null) => {
    const next = clampSelection(user, country);
    setSelectedCountryState(next);
    writeStoredCountry(next);
    // Refresh marketplace + promo queries that depend on country scope.
    void queryClient.invalidateQueries({ queryKey: ["listings"] });
    void queryClient.invalidateQueries({ queryKey: ["listings-infinite"] });
    void queryClient.invalidateQueries({ queryKey: ["videos"] });
    void queryClient.invalidateQueries({ queryKey: ["video-feed"] });
    void queryClient.invalidateQueries({ queryKey: ["promo-videos"] });
  }, [user, queryClient]);

  const effectiveCountry = resolveEffectiveAdminCountry(user, selectedCountry);
  const showCountryFlags = shouldShowAdminCountryFlags(user, effectiveCountry);
  const videoFeedScopeKey = adminVideoFeedParamsKey(
    buildAdminVideoFeedParams(user, effectiveCountry),
  );
  // Memoize by content so Discover/TikTok feed deps do not thrash every render.
  const videoFeedParams = useMemo(
    () => buildAdminVideoFeedParams(user, effectiveCountry),
    // user + effectiveCountry + scope key — key collapses identical param objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoFeedScopeKey, isAdminViewer, isSuperAdmin, isGlobalAdmin],
  );

  const value = useMemo<AdminCountryContextValue>(() => ({
    selectedCountry,
    setSelectedCountry,
    effectiveCountry,
    selectableCountries,
    pickerCountries,
    canSelectAll,
    showCountryFlags,
    isAdminViewer,
    isSuperAdmin,
    isGlobalAdmin,
    isMultiCountryAdmin: isMulti,
    videoFeedParams,
  }), [
    selectedCountry,
    setSelectedCountry,
    effectiveCountry,
    selectableCountries,
    pickerCountries,
    canSelectAll,
    showCountryFlags,
    isAdminViewer,
    isSuperAdmin,
    isGlobalAdmin,
    isMulti,
    videoFeedParams,
  ]);

  return (
    <AdminCountryContext.Provider value={value}>
      {children}
    </AdminCountryContext.Provider>
  );
}

export function useAdminCountry() {
  return useContext(AdminCountryContext);
}
