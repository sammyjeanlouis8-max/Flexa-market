/**
 * Account recovery — POST /api/recovery/* (not legacy /auth/forgot-password).
 */
import { getBaseUrl } from "../context/AuthContext";

export type RecoveryFailure = {
  status: number;
  error: string;
  remaining?: number;
  useSecurityQuestions?: boolean;
  noQuestions?: boolean;
  locked?: boolean;
  expired?: boolean;
  suspended?: boolean;
};

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: RecoveryFailure };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function fail(res: Response, data: any): Fail {
  return {
    ok: false,
    error: {
      status: res.status,
      error: typeof data?.error === "string" ? data.error : "Request failed",
      remaining: typeof data?.remaining === "number" ? data.remaining : undefined,
      useSecurityQuestions: Boolean(data?.useSecurityQuestions),
      noQuestions: Boolean(data?.noQuestions),
      locked: Boolean(data?.locked),
      expired: Boolean(data?.expired),
      suspended: Boolean(data?.suspended),
    },
  };
}

async function post(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function recoveryStart(identifier: string): Promise<
  Ok<{
    sent: boolean;
    sessionToken?: string;
    sentVia?: string;
    maskedDestination?: string;
    devCode?: string;
  }> | Fail
> {
  try {
    const res = await post("/recovery/start", { identifier: identifier.trim() });
    const data = await readJson(res);
    if (!res.ok) return fail(res, data);
    return { ok: true, data };
  } catch {
    return { ok: false, error: { status: 0, error: "Could not connect to server" } };
  }
}

export async function recoveryVerifyOtp(input: {
  sessionToken: string;
  code: string;
}): Promise<Ok<Record<string, unknown>> | Fail> {
  try {
    const res = await post("/recovery/verify-otp", {
      sessionToken: input.sessionToken,
      code: input.code.trim(),
    });
    const data = await readJson(res);
    if (!res.ok) return fail(res, data);
    return { ok: true, data };
  } catch {
    return { ok: false, error: { status: 0, error: "Could not connect to server" } };
  }
}

export async function recoveryResendOtp(sessionToken: string): Promise<
  Ok<{ maskedDestination?: string }> | Fail
> {
  try {
    const res = await post("/recovery/resend-otp", { sessionToken });
    const data = await readJson(res);
    if (!res.ok) return fail(res, data);
    return { ok: true, data };
  } catch {
    return { ok: false, error: { status: 0, error: "Could not connect to server" } };
  }
}

export type SecurityQuestion = { key: string; text: string };

export async function recoveryGetQuestions(sessionToken: string): Promise<
  Ok<{ questions: SecurityQuestion[] }> | Fail
> {
  try {
    const res = await post("/recovery/get-questions", { sessionToken });
    const data = await readJson(res);
    if (!res.ok) return fail(res, data);
    return {
      ok: true,
      data: { questions: Array.isArray(data.questions) ? data.questions : [] },
    };
  } catch {
    return { ok: false, error: { status: 0, error: "Could not connect to server" } };
  }
}

export async function recoveryVerifySecurity(input: {
  sessionToken: string;
  answers: Array<{ key: string; answer: string }>;
}): Promise<Ok<Record<string, unknown>> | Fail> {
  try {
    const res = await post("/recovery/verify-security", {
      sessionToken: input.sessionToken,
      answers: input.answers,
    });
    const data = await readJson(res);
    if (!res.ok) return fail(res, data);
    return { ok: true, data };
  } catch {
    return { ok: false, error: { status: 0, error: "Could not connect to server" } };
  }
}

export async function recoveryResetPassword(input: {
  sessionToken: string;
  password: string;
}): Promise<Ok<{ success?: boolean; message?: string }> | Fail> {
  try {
    const res = await post("/recovery/reset-password", {
      sessionToken: input.sessionToken,
      password: input.password,
    });
    const data = await readJson(res);
    if (!res.ok) return fail(res, data);
    return { ok: true, data };
  } catch {
    return { ok: false, error: { status: 0, error: "Could not connect to server" } };
  }
}
