import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { unregisterExpoPushToken } from "@/lib/pushPrep";

const TOKEN_KEY = "flexamarket_token";

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
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const fetchUser = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${getBaseUrl()}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else if (res.status === 401) {
        // Only a definitive invalid-token response may destroy the saved
        // session. Temporary server/proxy errors must leave the user signed in.
        // Best-effort push unregister before wiping the JWT.
        await unregisterExpoPushToken(t).catch(() => {});
        await AsyncStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    } catch {
      // network error — keep token, retry later
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY)
      .then(async (stored) => {
        if (stored) {
          setToken(stored);
          await fetchUser(stored);
        }
      })
      .catch(() => { /* storage unavailable — proceed as logged-out */ })
      .finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = useCallback(
    async (newToken: string) => {
      const previous = tokenRef.current;
      // Account switch: drop the previous account's device push binding first.
      if (previous && previous !== newToken) {
        await unregisterExpoPushToken(previous).catch(() => {});
      }
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      await fetchUser(newToken);
    },
    [fetchUser]
  );

  const logout = useCallback(async () => {
    const current = tokenRef.current;
    // Unregister while JWT is still valid so ownership checks succeed.
    await unregisterExpoPushToken(current).catch(() => {});
    await AsyncStorage.removeItem(TOKEN_KEY);
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
