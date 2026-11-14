/**
 * Flexa Control staff session — verifies GET /admin/me and holds country/period filters.
 * Privileged payload is cleared when the signed-in account or role/scope changes.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth, type User } from "@/context/AuthContext";
import {
  type AccessPhase,
  type AdminMe,
  getCanonicalRole,
  mayAccessFlexaControl,
  normalizeRole,
  roleDisplayLabel,
  type StaffRole,
} from "@/lib/adminAccess";
import {
  canAdminSelectAllCountries,
  getAdminSelectableCountries,
  isGlobalCountryAdmin,
  isSuperAdminUser,
  resolveEffectiveAdminCountry,
  type ScopeUser,
} from "@/lib/adminCountryAccess";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { ApiError, apiRequest } from "@/lib/request";

const ADMIN_COUNTRY_KEY = "flexamarket_admin_country";

export type PeriodKey = "today" | "7d" | "30d" | "year";

type AdminControlValue = {
  phase: AccessPhase;
  me: AdminMe | null;
  errorMessage: string | null;
  role: StaffRole;
  roleLabel: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isSupport: boolean;
  can: (perm: string) => boolean;
  selectedCountry: string | null;
  setSelectedCountry: (country: string | null) => void;
  effectiveCountry: string | null;
  pickerCountries: string[];
  canSelectAll: boolean;
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  scopeUser: ScopeUser;
  refreshAccess: () => Promise<void>;
  clearPrivileged: () => void;
};

const AdminControlContext = createContext<AdminControlValue | null>(null);

function toScopeUser(user: User | null, me: AdminMe | null): ScopeUser {
  if (!user) return null;
  return {
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin,
    role: me?.role ?? user.role,
    adminScopeCountry: me?.scopeCountry ?? user.adminScopeCountry,
    adminScopeCountries: me?.scopeCountries
      ? JSON.stringify(me.scopeCountries)
      : user.adminScopeCountries,
    adminScopeDepartment: me?.scopeDepartment ?? user.adminScopeDepartment,
    adminScopeCity: me?.scopeCity ?? user.adminScopeCity,
    country: user.country,
  };
}

function clampSelection(scope: ScopeUser, selected: string | null): string | null {
  if (!scope) return null;
  if (isSuperAdminUser(scope) || isGlobalCountryAdmin(scope)) {
    if (!selected) return null;
    const match = SUPPORTED_COUNTRIES.find((c) => c.toLowerCase() === selected.toLowerCase());
    return match ?? null;
  }
  const assigned = getAdminSelectableCountries(scope);
  if (assigned.length <= 1) return assigned[0] ?? null;
  if (!selected) return null;
  return assigned.find((c) => c.toLowerCase() === selected.toLowerCase()) ?? null;
}

export function AdminControlProvider({ children }: { children: ReactNode }) {
  const { token, user, isLoading: authLoading, logout } = useAuth();
  const [phase, setPhase] = useState<AccessPhase>("boot");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountryState] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const lastUserId = useRef<number | null>(null);

  const clearPrivileged = useCallback(() => {
    setMe(null);
    setErrorMessage(null);
    setSelectedCountryState(null);
    setPeriod("today");
  }, []);

  const refreshAccess = useCallback(async () => {
    if (authLoading) {
      setPhase("boot");
      return;
    }
    if (!token) {
      clearPrivileged();
      setPhase("unauthenticated");
      return;
    }

    setPhase("checking");
    setErrorMessage(null);

    try {
      const profile = await apiRequest<AdminMe>("/admin/me", { token });
      setMe(profile);
      setPhase("allowed");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          clearPrivileged();
          setPhase("session_expired");
          await logout();
          return;
        }
        if (e.status === 403) {
          setMe(null);
          setPhase("denied");
          setErrorMessage(
            typeof e.message === "string" && e.message
              ? e.message
              : "Admin or support role required.",
          );
          return;
        }
      }
      // Network / 5xx — keep any prior me only if same user; otherwise error state
      setPhase("network_error");
      setErrorMessage(e instanceof Error ? e.message : "Network error loading permissions");
    }
  }, [authLoading, token, clearPrivileged, logout]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  // Clear privileged caches when account identity changes
  useEffect(() => {
    const id = user?.id ?? null;
    if (lastUserId.current != null && id !== lastUserId.current) {
      clearPrivileged();
    }
    lastUserId.current = id;
  }, [user?.id, clearPrivileged]);

  // Also clear when role flags flip between staff ↔ non-staff
  useEffect(() => {
    if (!user) return;
    if (!mayAccessFlexaControl(user) && phase === "allowed") {
      clearPrivileged();
      setPhase("denied");
    }
  }, [user, phase, clearPrivileged]);

  // Restore country preference once allowed
  useEffect(() => {
    if (phase !== "allowed") return;
    AsyncStorage.getItem(ADMIN_COUNTRY_KEY)
      .then((raw) => {
        if (!raw || raw === "all" || raw === "null") setSelectedCountryState(null);
        else setSelectedCountryState(raw);
      })
      .catch(() => {});
  }, [phase, user?.id]);

  const scopeUser = useMemo(() => toScopeUser(user, me), [user, me]);
  const role = getCanonicalRole(
    me ? { role: me.role, isAdmin: user?.isAdmin, isSuperAdmin: user?.isSuperAdmin } : user,
  );
  const clampedCountry = useMemo(
    () => clampSelection(scopeUser, selectedCountry),
    [scopeUser, selectedCountry],
  );

  useEffect(() => {
    if (phase !== "allowed") return;
    if (clampedCountry !== selectedCountry) {
      setSelectedCountryState(clampedCountry);
    }
  }, [phase, clampedCountry, selectedCountry]);

  const setSelectedCountry = useCallback((country: string | null) => {
    const next = country && country !== "all" ? country : null;
    setSelectedCountryState(next);
    AsyncStorage.setItem(ADMIN_COUNTRY_KEY, next ?? "all").catch(() => {});
  }, []);

  const canSelectAll = canAdminSelectAllCountries(scopeUser);
  const selectable = getAdminSelectableCountries(scopeUser);
  const pickerCountries = useMemo(() => {
    if (phase !== "allowed") return [];
    if (isSuperAdminUser(scopeUser) || isGlobalCountryAdmin(scopeUser)) {
      return [...SUPPORTED_COUNTRIES];
    }
    return selectable;
  }, [phase, scopeUser, selectable]);

  const effectiveCountry = resolveEffectiveAdminCountry(scopeUser, clampedCountry);

  const value = useMemo<AdminControlValue>(
    () => ({
      phase,
      me,
      errorMessage,
      role,
      roleLabel: roleDisplayLabel(role),
      isSuperAdmin: role === "superadmin",
      isAdmin: role === "admin" || role === "superadmin",
      isModerator: role === "moderator",
      isSupport: role === "support",
      can: (perm: string) => !!me?.permissions?.[perm],
      selectedCountry: clampedCountry,
      setSelectedCountry,
      effectiveCountry,
      pickerCountries,
      canSelectAll,
      period,
      setPeriod,
      scopeUser,
      refreshAccess,
      clearPrivileged,
    }),
    [
      phase,
      me,
      errorMessage,
      role,
      clampedCountry,
      setSelectedCountry,
      effectiveCountry,
      pickerCountries,
      canSelectAll,
      period,
      scopeUser,
      refreshAccess,
      clearPrivileged,
    ],
  );

  return (
    <AdminControlContext.Provider value={value}>{children}</AdminControlContext.Provider>
  );
}

export function useAdminControl() {
  const ctx = useContext(AdminControlContext);
  if (!ctx) {
    throw new Error("useAdminControl must be used within AdminControlProvider");
  }
  return ctx;
}

/** Safe optional hook for screens outside the provider. */
export function useAdminControlOptional() {
  return useContext(AdminControlContext);
}

export function adminCountryQuery(effectiveCountry: string | null): string {
  if (!effectiveCountry) return "";
  return `country=${encodeURIComponent(effectiveCountry)}`;
}

export function normalizeStaffRoleFromMe(me: AdminMe | null): string {
  return normalizeRole(me?.role);
}
