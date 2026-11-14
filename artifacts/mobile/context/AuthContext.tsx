import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const TOKEN_KEY = "flexamarket_token";
const USER_CACHE_KEY = "flexamarket_user_cache";

export function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  // Production marketplace ingress (DigitalOcean App Platform behind flexamarket.com).
  return "https://flexamarket.com/api";
}

export interface User {
  id: number;
  name: string;
  email: string;
  country?: string;
  avatarUrl?: string;
  city?: string;
  location?: string;
  bio?: string;
  isPhoneVerified?: boolean;
  role?: string;
  phone?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isAdminSuspended?: boolean;
  adminSuspendedUntil?: string | null;
  adminScopeCountry?: string | null;
  adminScopeCountries?: string | null;
  adminScopeDepartment?: string | null;
  adminScopeCity?: string | null;
  kycStatus?: "not_submitted" | "pending" | "approved" | "rejected";
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  /** Apply session token; optional login payload user avoids a flash of empty roles. */
  login: (token: string, user?: User | null) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

async function cacheUser(user: User | null) {
  try {
    if (user) await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else await AsyncStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function parseCachedUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as User;
    if (parsed && typeof parsed.id === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyUser = useCallback((next: User | null) => {
    setUser(next);
    void cacheUser(next);
  }, []);

  const fetchUser = useCallback(
    async (t: string) => {
      try {
        const res = await fetch(`${getBaseUrl()}/auth/me`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const data = (await res.json()) as User;
          applyUser(data);
          return data;
        }
        if (res.status === 401) {
          // Only a definitive invalid-token response may destroy the saved
          // session. Temporary server/proxy errors must leave the user signed in.
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_CACHE_KEY]);
          setToken(null);
          applyUser(null);
        }
      } catch {
        // network error — keep token + cached user, retry later
      }
      return null;
    },
    [applyUser],
  );

  useEffect(() => {
    (async () => {
      try {
        const [[, stored], [, cached]] = await AsyncStorage.multiGet([TOKEN_KEY, USER_CACHE_KEY]);
        if (stored) {
          setToken(stored);
          const cachedUser = parseCachedUser(cached);
          if (cachedUser) setUser(cachedUser);
          await fetchUser(stored);
        }
      } catch {
        /* storage unavailable — proceed as logged-out */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchUser]);

  const login = useCallback(
    async (newToken: string, seedUser?: User | null) => {
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      if (seedUser && typeof seedUser.id === "number") {
        applyUser(seedUser);
      }
      await fetchUser(newToken);
    },
    [applyUser, fetchUser],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_CACHE_KEY, "flexamarket_admin_country"]);
    setToken(null);
    applyUser(null);
  }, [applyUser]);

  const refreshUser = useCallback(async () => {
    if (token) await fetchUser(token);
  }, [token, fetchUser]);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
