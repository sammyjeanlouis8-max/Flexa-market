import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";

type User = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  isPhoneVerified: boolean;
  avatar?: string | null;
  location?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  bio?: string | null;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: string;
  isBanned: boolean;
  isRestricted: boolean;
  restrictedUntil: string | null;
  restrictionReason: string | null;
  followerCount: number;
  followingCount: number;
  listingCount: number;
  preferredLanguage?: string | null;
  translateMessages?: boolean | null;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
  stripeAccountId?: string | null;
  stripeAccountStatus?: string | null;
  createdAt: string;
  profileCompleted: boolean;
};

const PASSWORD_UPGRADE_KEY = "flexamarket_requires_pw_upgrade";
const LANG_MODAL_DISMISSED_KEY = "flexamarket_lang_modal_dismissed";

// How long (ms) to wait for /auth/me before giving up and rendering the app
// without a user — prevents infinite spinner on slow API cold starts.
const AUTH_TIMEOUT_MS = 9_000;

type AuthContextType = {
  user: User | null;
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
  refreshUser: () => void;
  isLoading: boolean;
  requiresPasswordUpgrade: boolean;
  setRequiresPasswordUpgrade: (value: boolean) => void;
  dismissPasswordUpgrade: () => void;
  /** True when user has never set a language preference — show the picker modal */
  showLanguageModal: boolean;
  dismissLanguageModal: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  setToken: () => {},
  logout: () => {},
  refreshUser: () => {},
  isLoading: false,
  requiresPasswordUpgrade: false,
  setRequiresPasswordUpgrade: () => {},
  dismissPasswordUpgrade: () => {},
  showLanguageModal: false,
  dismissLanguageModal: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    const current = localStorage.getItem("flexamarket_token");
    if (current) return current;
    const legacy = localStorage.getItem("bazarhub_token");
    if (legacy) {
      localStorage.setItem("flexamarket_token", legacy);
      localStorage.removeItem("bazarhub_token");
      return legacy;
    }
    return null;
  });

  const [requiresPasswordUpgrade, setRequiresPasswordUpgradeState] = useState<boolean>(() => {
    return localStorage.getItem(PASSWORD_UPGRADE_KEY) === "true";
  });

  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Failsafe: if /auth/me hasn't resolved within AUTH_TIMEOUT_MS, stop blocking
  // the UI.  The query keeps running in the background — if it eventually
  // succeeds, user state will update automatically.
  const [authTimedOut, setAuthTimedOut] = useState(false);

  const queryClient = useQueryClient();

  const setToken = (t: string | null) => {
    if (t) {
      localStorage.setItem("flexamarket_token", t);
    } else {
      localStorage.removeItem("flexamarket_token");
      localStorage.removeItem(PASSWORD_UPGRADE_KEY);
      localStorage.removeItem(LANG_MODAL_DISMISSED_KEY);
      setRequiresPasswordUpgradeState(false);
      setShowLanguageModal(false);
    }
    setTokenState(t);
    setAuthTimedOut(false);
  };

  const setRequiresPasswordUpgrade = (value: boolean) => {
    if (value) {
      localStorage.setItem(PASSWORD_UPGRADE_KEY, "true");
    } else {
      localStorage.removeItem(PASSWORD_UPGRADE_KEY);
    }
    setRequiresPasswordUpgradeState(value);
  };

  const dismissPasswordUpgrade = () => {
    localStorage.removeItem(PASSWORD_UPGRADE_KEY);
    setRequiresPasswordUpgradeState(false);
  };

  const dismissLanguageModal = () => {
    localStorage.setItem(LANG_MODAL_DISMISSED_KEY, "1");
    setShowLanguageModal(false);
  };

  const logout = () => setToken(null);

  // ── Silent token refresh ────────────────────────────────────────────────────
  // Decode JWT exp from base64 (no crypto needed in browser).
  // If the token will expire within 60 days, exchange it for a fresh 365d one.
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const expiresAt = (payload.exp ?? 0) * 1000;
      const msUntilExpiry = expiresAt - Date.now();
      const sixtyDays = 60 * 24 * 60 * 60 * 1000;
      if (msUntilExpiry > 0 && msUntilExpiry < sixtyDays) {
        fetch("/api/auth/refresh", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.token) setToken(data.token); })
          .catch(() => {});
      }
    } catch { /* malformed token — ignore */ }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: user, isLoading: queryIsLoading, isError, error, refetch } = useGetMe({
    query: { enabled: !!token, retry: 0, queryKey: ["getMe", token] },
  });

  // When /auth/me returns 401 the stored token is no longer valid (banned account,
  // invalidated session, etc.).  Clear it immediately and redirect to login so the
  // user can sign in with a different account instead of being stuck on a broken state.
  useEffect(() => {
    if (!isError || !token) return;
    const status = (error as any)?.status;
    const data = (error as any)?.data;
    if (status === 403 && data?.suspended) {
      // Banned account — redirect to suspended screen without clearing token
      // (token stays so the suspended page doesn't need a re-login).
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      window.location.replace(`${base}/auth/suspended`);
    } else if (status === 401) {
      // Remove the invalid token first so the redirect boots with a clean slate.
      localStorage.removeItem("flexamarket_token");
      localStorage.removeItem(PASSWORD_UPGRADE_KEY);
      localStorage.removeItem(LANG_MODAL_DISMISSED_KEY);
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      window.location.replace(`${base}/auth/login`);
    }
  }, [isError, error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start auth timeout whenever a token-gated fetch is in-flight.
  useEffect(() => {
    if (!token || !queryIsLoading) {
      setAuthTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      setAuthTimedOut(true);
    }, AUTH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [token, queryIsLoading]);

  // Log when user data arrives or errors out.
  useEffect(() => {
    if (user) {
      console.log("[Auth] User loaded:", (user as User).email);
    }
  }, [user]);

  // Apply the user's saved language when they log in.
  // Spec §1: user.preferredLanguage is the single source of truth.
  // It always wins over any locally stored value — instantly, no reload.
  useEffect(() => {
    if (!user) return;
    const u = user as User;

    const stored = localStorage.getItem("flexamarket_lang");
    if (
      u.preferredLanguage &&
      SUPPORTED_LANGUAGES.some(l => l.code === u.preferredLanguage) &&
      stored !== u.preferredLanguage
    ) {
      setLanguage(u.preferredLanguage as SupportedLanguage);
    }

    // Language modal is disabled — English is the default, users change via Settings.
    setShowLanguageModal(false);
  }, [user]);

  const refreshUser = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["getListings"] });
    queryClient.invalidateQueries({ queryKey: ["getListingsForyou"] });
  };

  // isLoading is only true while actively fetching AND within the timeout window.
  // After AUTH_TIMEOUT_MS the UI unblocks — the query keeps running in the background.
  const isLoading = queryIsLoading && !authTimedOut;

  return (
    <AuthContext.Provider value={{
      user: user as User | null ?? null,
      token,
      setToken,
      logout,
      refreshUser,
      isLoading,
      requiresPasswordUpgrade,
      setRequiresPasswordUpgrade,
      dismissPasswordUpgrade,
      showLanguageModal,
      dismissLanguageModal,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
