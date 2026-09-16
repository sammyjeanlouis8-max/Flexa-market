import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import {
  restoreSessionToken,
  restoreSessionUser,
  setCurrentSessionToken,
  setCurrentSessionUser,
} from "@/lib/sessionToken";

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
  flexCardBlocked?: boolean;
  flexCardDebtUsd?: number;
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
  setToken: (token: string | null, user?: User | null) => void;
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
  const [token, setTokenState] = useState<string | null>(restoreSessionToken);
  // A successful login already returns the user. Keep that value available
  // immediately instead of briefly rendering the guest UI while /auth/me runs.
  const [loginUser, setLoginUser] = useState<User | null>(() => restoreSessionUser<User>());

  const [requiresPasswordUpgrade, setRequiresPasswordUpgradeState] = useState<boolean>(() => {
    return localStorage.getItem(PASSWORD_UPGRADE_KEY) === "true";
  });

  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Failsafe: if /auth/me hasn't resolved within AUTH_TIMEOUT_MS, stop blocking
  // the UI.  The query keeps running in the background — if it eventually
  // succeeds, user state will update automatically.
  const [authTimedOut, setAuthTimedOut] = useState(false);

  const queryClient = useQueryClient();
  // These refs are the authoritative session identity. They are changed
  // synchronously by setToken, before persistence or React state updates, so
  // an old async response can never resurrect a replaced/logged-out session.
  const tokenRef = useRef<string | null>(token);
  const sessionGenerationRef = useRef(0);
  const redirectingRef = useRef(false);

  const setToken = (t: string | null, nextUser?: User | null) => {
    const previousToken = tokenRef.current;
    const nextGeneration = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = nextGeneration;
    tokenRef.current = t;
    // Commit the live session before touching browser persistence. Safari and
    // embedded WebViews can throw on localStorage/cookie writes; that must not
    // turn a successful login into an immediately logged-out UI.
    setTokenState(t);
    setAuthTimedOut(false);
    setCurrentSessionToken(t);
    if (!t) {
      setLoginUser(null);
      setCurrentSessionUser(null);
    } else if (nextUser) {
      setLoginUser(nextUser);
      setCurrentSessionUser(nextUser, t);
    } else if (previousToken !== t) {
      // A token replacement without its verified user must not retain the
      // previous account's cached identity.
      setLoginUser(null);
      setCurrentSessionUser(null);
    }
    if (!t) {
      try {
        localStorage.removeItem(PASSWORD_UPGRADE_KEY);
        localStorage.removeItem(LANG_MODAL_DISMISSED_KEY);
      } catch {
        // State and refs are already cleared.
      }
      setRequiresPasswordUpgradeState(false);
      setShowLanguageModal(false);
    }
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

  const redirectToLogin = () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    logout();
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const currentPath = window.location.pathname + window.location.search;
    const isAuthPage = currentPath.includes("/auth/");
    const nextParam = (!isAuthPage && currentPath !== "/" && currentPath !== (import.meta.env.BASE_URL ?? "/"))
      ? `?next=${encodeURIComponent(currentPath)}`
      : "";
    window.location.replace(`${base}/auth/login${nextParam}`);
  };

  const redirectToSuspended = () => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const suspendedPath = `${base}/auth/suspended`;
    if (
      window.location.pathname === suspendedPath ||
      window.location.pathname.endsWith("/auth/suspended")
    ) {
      return;
    }
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    window.location.replace(`${base}/auth/suspended`);
  };

  const isCurrentSession = (expectedToken: string, expectedGeneration: number) =>
    tokenRef.current === expectedToken &&
    sessionGenerationRef.current === expectedGeneration;

  // Capture the token in the request itself as well as in the query key. This
  // prevents a delayed request for an old token from being sent with a newly
  // rotated localStorage token.
  const authQueryToken = token;
  const authQueryGeneration = sessionGenerationRef.current;
  const {
    data: user,
    isLoading: queryIsLoading,
    isError,
    error,
    refetch,
    queryKey: authQueryKey,
  } = useGetMe({
    query: {
      enabled: !!authQueryToken,
      retry: 0,
      queryKey: ["getMe", authQueryToken, authQueryGeneration],
    },
    request: authQueryToken
      ? { headers: { Authorization: `Bearer ${authQueryToken}` } }
      : undefined,
  });

  // When /auth/me returns 401 the stored token is no longer valid (banned account,
  // invalidated session, etc.).  Clear it immediately and redirect to login so the
  // user can sign in with a different account instead of being stuck on a broken state.
  const currentAuthQueryToken =
    typeof authQueryKey?.[1] === "string" ? authQueryKey[1] : null;
  const currentAuthQueryGeneration =
    typeof authQueryKey?.[2] === "number" ? authQueryKey[2] : null;
  useEffect(() => {
    // This check must use the authoritative synchronous refs, not only the
    // committed React state captured by this effect. An old committed effect
    // can run after a logout/login transition.
    if (
      !isError ||
      !token ||
      currentAuthQueryToken !== token ||
      currentAuthQueryGeneration !== authQueryGeneration ||
      !isCurrentSession(currentAuthQueryToken, currentAuthQueryGeneration ?? -1)
    ) return;
    const status = (error as any)?.status;
    const data = (error as any)?.data;
    if (status === 403 && data?.suspended) {
      // Banned account — redirect to suspended screen without clearing token
      // (token stays so the suspended page doesn't need a re-login).
      redirectToSuspended();
    } else if (status === 401) {
      // Remove the invalid token first so the redirect boots with a clean slate.
      // Preserve the current page as ?next= so the user lands back here after
      // logging in — critical when Safari drops the session after a Stripe redirect.
      redirectToLogin();
    }
  }, [
    isError,
    error,
    token,
    currentAuthQueryToken,
    currentAuthQueryGeneration,
    authQueryGeneration,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (
      !user ||
      !currentAuthQueryToken ||
      currentAuthQueryGeneration == null ||
      !isCurrentSession(currentAuthQueryToken, currentAuthQueryGeneration)
    ) return;
    setLoginUser(user as User);
    setCurrentSessionUser(user, currentAuthQueryToken);
  }, [user, currentAuthQueryToken, currentAuthQueryGeneration]);

  // Apply the user's saved language when they log in — two-way sync:
  //   • Server has a preference  → apply it locally (server wins).
  //   • Server preference is null → push local lang to server so push
  //     notifications arrive in the right language without logout.
  useEffect(() => {
    if (!user) return;
    const u = user as User;

    const stored = localStorage.getItem("flexamarket_lang");
    if (u.preferredLanguage && SUPPORTED_LANGUAGES.some(l => l.code === u.preferredLanguage)) {
      // Server wins → update local only when it differs
      if (stored !== u.preferredLanguage) {
        setLanguage(u.preferredLanguage as SupportedLanguage);
      }
    } else if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored) && token) {
      // Local wins → tell the server (fire-and-forget, never blocks UI)
      void fetch("/api/auth/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: stored }),
      }).catch(() => {});
    }

    // Language modal is disabled — English is the default, users change via Settings.
    setShowLanguageModal(false);
  }, [user, token]);

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
      user: (user as User | null) ?? loginUser,
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
