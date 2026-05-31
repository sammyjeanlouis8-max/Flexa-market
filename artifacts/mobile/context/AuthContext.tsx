import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const TOKEN_KEY = "flexamarket_token";

export function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "https://f66c895f-9f08-483c-b4dc-160283cddc97-00-7tfbq27zhwzp.picard.replit.dev/api";
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
      } else {
        await AsyncStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    } catch {
      // network error — keep token, retry later
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then(async (stored) => {
      if (stored) {
        setToken(stored);
        await fetchUser(stored);
      }
      setIsLoading(false);
    });
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
