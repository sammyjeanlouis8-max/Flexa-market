/**
 * Native auth session context (Phase 0).
 *
 * Reads/writes the existing Flexa JWT on device and calls GET /api/auth/me.
 * Does not change backend login, password, OTP, or payment flows.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { clearAuthToken, readAuthToken, writeAuthToken } from "@/lib/auth-storage";
import { getApiBaseUrl } from "@/lib/config";

export function getBaseUrl() {
  return getApiBaseUrl();
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

  const fetchUser = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = (await res.json()) as User;
        setUser(data);
      } else if (res.status === 401) {
        // Only a definitive invalid-token response may destroy the saved
        // session. Temporary server/proxy errors must leave the user signed in.
        await clearAuthToken();
        setToken(null);
        setUser(null);
      }
    } catch {
      // network error — keep token, retry later
    }
  }, []);

  useEffect(() => {
    readAuthToken()
      .then(async (stored) => {
        if (stored) {
          setToken(stored);
          await fetchUser(stored);
        }
      })
      .catch(() => {
        /* storage unavailable — proceed as logged-out */
      })
      .finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = useCallback(
    async (newToken: string) => {
      await writeAuthToken(newToken);
      setToken(newToken);
      await fetchUser(newToken);
    },
    [fetchUser],
  );

  const logout = useCallback(async () => {
    await clearAuthToken();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (token) await fetchUser(token);
  }, [token, fetchUser]);

  return (
    <AuthContext.Provider
      value={{ token, user, isLoading, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
