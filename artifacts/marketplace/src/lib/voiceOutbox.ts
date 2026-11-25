export type PendingVoiceStatus =
  | "queued"
  | "waiting_connection"
  | "uploading"
  | "sending"
  | "failed";

export type PendingVoiceMessage = {
  /** Stable client id — reused on every retry for server idempotency. */
  id: string;
  conversationId: number;
  mimeType: string;
  bytes: ArrayBuffer;
  mediaUrl?: string;
  createdAt: number;
  /** Wall-clock of last status change — used to unstick hung uploading/sending. */
  updatedAt?: number;
  /** Recorded duration in seconds (UI); avoids 0:00 when metadata is slow on iOS. */
  durationSec?: number;
  attempts: number;
  lastError?: string;
  status?: PendingVoiceStatus;
};

const DB_NAME = "flexamarket-voice-outbox";
const DB_VERSION = 1;
const STORE_NAME = "pending-voices";

function openVoiceOutbox(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Voice outbox is not available on this device"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("conversationId", "conversationId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open voice outbox"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Voice outbox request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Voice outbox transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Voice outbox transaction aborted"));
  });
}

export async function savePendingVoice(input: {
  conversationId: number;
  blob: Blob;
  mimeType: string;
  id?: string;
  durationSec?: number;
}): Promise<PendingVoiceMessage> {
  const now = Date.now();
  const item: PendingVoiceMessage = {
    id: input.id || "voice-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
    conversationId: input.conversationId,
    mimeType: input.mimeType,
    bytes: await input.blob.arrayBuffer(),
    createdAt: now,
    updatedAt: now,
    durationSec: input.durationSec,
    attempts: 0,
    status: typeof navigator !== "undefined" && !navigator.onLine ? "waiting_connection" : "queued",
  };
  const db = await openVoiceOutbox();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(STORE_NAME).put(item);
    await done;
    return item;
  } finally {
    db.close();
  }
}

export async function listPendingVoices(conversationId: number): Promise<PendingVoiceMessage[]> {
  const db = await openVoiceOutbox();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const values = await requestResult(
      tx.objectStore(STORE_NAME).index("conversationId").getAll(conversationId),
    );
    return values.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function updatePendingVoice(
  id: string,
  patch: Partial<
    Pick<
      PendingVoiceMessage,
      "mediaUrl" | "attempts" | "lastError" | "status" | "mimeType" | "durationSec" | "updatedAt"
    >
  >,
): Promise<void> {
  const db = await openVoiceOutbox();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const done = transactionDone(tx);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      if (getRequest.result) {
        store.put({ ...getRequest.result, ...patch, updatedAt: patch.updatedAt ?? Date.now() });
      }
    };
    getRequest.onerror = () => tx.abort();
    await done;
  } finally {
    db.close();
  }
}

/** Mark uploading/sending rows that never settled as failed so the queue can retry. */
export async function recoverStalePendingVoices(
  conversationId: number,
  maxAgeMs = 55_000,
): Promise<number> {
  const pending = await listPendingVoices(conversationId);
  const now = Date.now();
  let recovered = 0;
  for (const item of pending) {
    if (item.status !== "uploading" && item.status !== "sending") continue;
    const anchor = item.updatedAt ?? item.createdAt;
    if (now - anchor < maxAgeMs) continue;
    await updatePendingVoice(item.id, {
      status: "failed",
      lastError: "Upload timed out",
      attempts: item.attempts + 1,
    });
    recovered += 1;
  }
  return recovered;
}

export async function removePendingVoice(id: string): Promise<void> {
  const db = await openVoiceOutbox();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(STORE_NAME).delete(id);
    await done;
  } finally {
    db.close();
  }
}
