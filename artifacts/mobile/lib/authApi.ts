import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getBaseUrl } from "../context/AuthContext";

const DEVICE_ID_KEY = "bh_device_id";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  country?: string | null;
  phone?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  role?: string;
};

export type AuthSuccess = {
  token: string;
  user: AuthUser;
  requiresPasswordUpgrade?: boolean;
};

export type AuthFailure = {
  status: number;
  error: string;
  field?: string;
  code?: string;
};

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
  } catch {
    /* continue */
  }
  const id =
    `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

async function parseError(res: Response): Promise<AuthFailure> {
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return {
    status: res.status,
    error: typeof data?.error === "string" ? data.error : "Request failed",
    field: typeof data?.field === "string" ? data.field : undefined,
    code: typeof data?.code === "string" ? data.code : undefined,
  };
}

export async function loginWithEmail(input: {
  email: string;
  password: string;
  eulaAccepted: boolean;
}): Promise<{ ok: true; data: AuthSuccess } | { ok: false; error: AuthFailure }> {
  try {
    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${getBaseUrl()}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: input.email.trim().toLowerCase(),
        password: input.password.trim(),
        eulaAccepted: input.eulaAccepted,
        deviceId,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: await parseError(res) };
    }
    const data = (await res.json()) as AuthSuccess;
    if (!data?.token) {
      return {
        ok: false,
        error: { status: res.status, error: "Login initialization failed" },
      };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: { status: 0, error: "Could not connect to server" },
    };
  }
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
  country: string;
  phone?: string;
  location?: string;
  promoCode?: string;
  eulaAccepted: boolean;
}): Promise<{ ok: true; data: AuthSuccess } | { ok: false; error: AuthFailure }> {
  try {
    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${getBaseUrl()}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password.trim(),
        country: input.country,
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.location ? { location: input.location } : {}),
        ...(input.promoCode ? { promoCode: input.promoCode.trim().toUpperCase() } : {}),
        deviceId,
        eulaAccepted: input.eulaAccepted,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: await parseError(res) };
    }
    const data = (await res.json()) as AuthSuccess;
    if (!data?.token) {
      return {
        ok: false,
        error: { status: res.status, error: "Login initialization failed" },
      };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: { status: 0, error: "Could not connect to server" },
    };
  }
}
