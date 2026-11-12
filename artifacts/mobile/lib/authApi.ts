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

export type RecoveryStartSuccess = {
  sent: boolean;
  sessionToken: string;
  sentVia: "email";
  maskedDestination?: string;
  devCode?: string;
};

export type RecoveryQuestion = { key: string; text: string };

async function recoveryPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: AuthFailure & Record<string, unknown> }> {
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      return {
        ok: false,
        error: {
          status: res.status,
          error: typeof data?.error === "string" ? data.error : "Request failed",
          field: typeof data?.field === "string" ? data.field : undefined,
          code: typeof data?.code === "string" ? data.code : undefined,
          ...data,
        },
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return {
      ok: false,
      error: { status: 0, error: "Could not connect to server" },
    };
  }
}

export function startRecovery(identifier: string) {
  return recoveryPost<RecoveryStartSuccess>("/recovery/start", {
    identifier: identifier.trim(),
  });
}

export function verifyRecoveryOtp(sessionToken: string, code: string) {
  return recoveryPost<{ verified: boolean; hasSecurityQuestions?: boolean }>(
    "/recovery/verify-otp",
    { sessionToken, code: code.trim() },
  );
}

export function resendRecoveryOtp(sessionToken: string) {
  return recoveryPost<{
    sent: boolean;
    sentVia?: string;
    maskedDestination?: string;
  }>("/recovery/resend-otp", { sessionToken });
}

export function getRecoveryQuestions(sessionToken: string) {
  return recoveryPost<{ questions: RecoveryQuestion[]; noQuestions?: boolean }>(
    "/recovery/get-questions",
    { sessionToken },
  );
}

export function verifyRecoverySecurity(
  sessionToken: string,
  answers: { key: string; answer: string }[],
) {
  return recoveryPost<{ verified: boolean }>("/recovery/verify-security", {
    sessionToken,
    answers,
  });
}

export function resetRecoveryPassword(sessionToken: string, password: string) {
  return recoveryPost<{ success: boolean; message?: string }>(
    "/recovery/reset-password",
    { sessionToken, password },
  );
}

export function loginWithTempPassword(input: {
  identifier: string;
  password: string;
}): Promise<{ ok: true; data: AuthSuccess & { mustChangePassword?: boolean } } | { ok: false; error: AuthFailure }> {
  return recoveryPost<AuthSuccess & { mustChangePassword?: boolean }>("/auth/login-temp", {
    identifier: input.identifier.trim(),
    password: input.password,
  }) as Promise<
    | { ok: true; data: AuthSuccess & { mustChangePassword?: boolean } }
    | { ok: false; error: AuthFailure }
  >;
}

export async function setNewPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: true; data: AuthSuccess } | { ok: false; error: AuthFailure }> {
  try {
    const res = await fetch(`${getBaseUrl()}/auth/set-new-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword }),
    });
    if (!res.ok) return { ok: false, error: await parseError(res) };
    const data = (await res.json()) as AuthSuccess;
    if (!data?.token) {
      return {
        ok: false,
        error: { status: res.status, error: "Password update failed" },
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
