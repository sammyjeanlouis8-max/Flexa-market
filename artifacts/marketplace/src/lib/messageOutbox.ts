/**
 * Durable offline queue for marketplace chat text (and future media).
 * Voice notes remain in voiceOutbox.ts; this store covers text retries.
 */

export type PendingChatMessage = {
  id: string; // clientMessageId
  conversationId: number;
  messageType: "text" | "image" | "video";
  content: string;
  mediaUrl?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: "pending" | "sending" | "failed";
};

const DB_NAME = "flexamarket-message-outbox";
const DB_VERSION = 1;
const STORE_NAME = "pending-messages";

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Message outbox unavailable"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("conversationId", "conversationId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Cannot open message outbox"));
  });
}

function reqResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Outbox request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Outbox tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Outbox tx aborted"));
  });
}

export function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function savePendingMessage(
  input: Omit<PendingChatMessage, "attempts" | "status" | "createdAt"> & { createdAt?: number },
): Promise<PendingChatMessage> {
  const item: PendingChatMessage = {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
    attempts: 0,
    status: "pending",
  };
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const done = txDone(tx);
    tx.objectStore(STORE_NAME).put(item);
    await done;
    return item;
  } finally {
    db.close();
  }
}

export async function listPendingMessages(conversationId: number): Promise<PendingChatMessage[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const values = await reqResult(
      tx.objectStore(STORE_NAME).index("conversationId").getAll(conversationId),
    );
    return values.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function updatePendingMessage(
  id: string,
  patch: Partial<Pick<PendingChatMessage, "mediaUrl" | "attempts" | "lastError" | "status">>,
): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const done = txDone(tx);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      if (getRequest.result) store.put({ ...getRequest.result, ...patch });
    };
    getRequest.onerror = () => tx.abort();
    await done;
  } finally {
    db.close();
  }
}

export async function removePendingMessage(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const done = txDone(tx);
    tx.objectStore(STORE_NAME).delete(id);
    await done;
  } finally {
    db.close();
  }
}
