import { useAuth, getBaseUrl } from "@/context/AuthContext";

export { getBaseUrl };

export function useApi() {
  const { token } = useAuth();

  async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 12000): Promise<T> {
    const url = `${getBaseUrl()}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return res.json() as Promise<T>;
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === "AbortError") throw new Error("Koneksyon twò lant. Eseye ankò.");
      throw e;
    }
  }

  return { request };
}

export interface Listing {
  id: number;
  title: string;
  price: string;
  images: string[];
  condition: string;
  location: string;
  city?: string;
  country: string;
  createdAt: string;
  isBoosted?: boolean;
  views?: number;
  description?: string;
  category?: string;
  subcategory?: string;
  status?: string;
  seller?: {
    id: number;
    name: string;
    avatarUrl?: string;
    city?: string;
    country?: string;
    rating?: number;
    reviewCount?: number;
  };
}

export interface Conversation {
  id: number;
  listing?: {
    id: number;
    title: string;
    images: string[];
    price: string;
  };
  otherUser?: {
    id: number;
    name: string;
    avatarUrl?: string;
  };
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
}
