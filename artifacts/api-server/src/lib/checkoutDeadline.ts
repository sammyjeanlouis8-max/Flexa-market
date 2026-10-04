export class CheckoutTimeoutError extends Error {
  constructor(readonly operation: string) {
    super(`${operation} did not complete within the checkout deadline`);
    this.name = "CheckoutTimeoutError";
  }
}

/** Bound the request AND response body, without retrying a payment creation. */
export async function withCheckoutDeadline<T>(
  operation: string,
  run: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new CheckoutTimeoutError(operation);
      reject(error);
      controller.abort(error);
    }, milliseconds);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => run(controller.signal)), deadline]);
  } finally {
    clearTimeout(timer);
  }
}