export class HaitiCheckoutError extends Error {
  constructor(readonly translationKey: string) {
    super(translationKey);
    this.name = "HaitiCheckoutError";
  }
}

export interface HaitiCheckoutInput {
  provider: string;
  amountHtg: number;
  phone?: string;
}

/** A timed-out creation must never be retried automatically. */
export async function initiateHaitiCheckout(
  input: HaitiCheckoutInput,
  token: string | null,
): Promise<{ redirectUrl: string; paymentRef?: string }> {
  if (navigator.onLine === false) throw new HaitiCheckoutError("haitiCheckout.offline");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new HaitiCheckoutError("haitiCheckout.timeout");
      reject(error);
      controller.abort();
    }, 45_000);
  });
  const request = async () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const response = await fetch(`${base}/api/wallet/haiti/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new HaitiCheckoutError("haitiCheckout.invalid");
    }
    if (!response.ok) {
      if (response.status >= 500) throw new HaitiCheckoutError("haitiCheckout.unavailable");
      throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${response.status}`);
    }
    if (typeof data?.redirectUrl !== "string") throw new HaitiCheckoutError("haitiCheckout.invalid");
    let url: URL;
    try { url = new URL(data.redirectUrl); }
    catch { throw new HaitiCheckoutError("haitiCheckout.invalid"); }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new HaitiCheckoutError("haitiCheckout.invalid");
    }
    return { redirectUrl: url.href, paymentRef: data.paymentRef };
  };
  try {
    return await Promise.race([request(), deadline]);
  } catch (error) {
    if (error instanceof HaitiCheckoutError) throw error;
    if (error instanceof TypeError || controller.signal.aborted) {
      throw new HaitiCheckoutError("haitiCheckout.network");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}