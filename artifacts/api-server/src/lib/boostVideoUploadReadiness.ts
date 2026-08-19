let ready = false;
let lastError: string | null = null;

export function markBoostVideoUploadReady(): void {
  ready = true;
  lastError = null;
}

export function markBoostVideoUploadUnavailable(error: unknown): void {
  ready = false;
  lastError = error instanceof Error ? error.message : String(error);
}

export function getBoostVideoUploadReadiness(): {
  ready: boolean;
  lastError: string | null;
} {
  return { ready, lastError };
}