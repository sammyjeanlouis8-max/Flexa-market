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
  avatar?: string | null;
  avatarUrl?: string | null;
  city?: string;
  location?: string;
  bio?: string;
  isPhoneVerified?: boolean;
  isVerified?: boolean;
  role?: string;
  phone?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  kycStatus?: "not_submitted" | "pending" | "approved" | "rejected";
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${getBaseUrl()}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        try {
          await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(data));
        } catch {
          /* ignore cache write */
        }
      } else if (res.status === 401) {
        // Only a definitive invalid-token response may destroy the saved
        // session. Temporary server/proxy errors must leave the user signed in.
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_CACHE_KEY]);
        setToken(null);
        setUser(null);
      } else {
        // 429 / 5xx — keep token and fall back to last good profile snapshot.
        const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
        if (cached) {
          try {
            setUser(JSON.parse(cached) as User);
          } catch {
            /* ignore bad cache */
          }
        }
      }
    } catch {
      // network error — keep token, prefer cached profile
      try {
        const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
        if (cached) setUser(JSON.parse(cached) as User);
      } catch {
        /* keep previous user */
      }
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY)
      .then(async (stored) => {
        if (stored) {
          setToken(stored);
          // Paint cached profile immediately so Settings does not flash signed-out
          // while /auth/me is slow or rate-limited.
          try {
            const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
            if (cached) setUser(JSON.parse(cached) as User);
          } catch {
            /* ignore */
          }
          await fetchUser(stored);
        }
      })
      .catch(() => { /* storage unavailable — proceed as logged-out */ })
      .finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = useCallback(
    async (newToken: string) => {
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      await fetchUser(newToken);
    },
    [fetchUser]
  );

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_CACHE_KEY]);
    setToken(null);
    setUser(null);
  }, []);

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
