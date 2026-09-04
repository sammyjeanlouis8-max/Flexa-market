export type PendingVoiceMessage = {
    id: string;
    conversationId: number;
    mimeType: string;
    bytes: ArrayBuffer;
    mediaUrl?: string;
    createdAt: number;
    attempts: number;
    lastError?: string;
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

    export async function savePendingVoice(input: {
    conversationId: number;
    blob: Blob;
    mimeType: string;
    }): Promise<PendingVoiceMessage> {
    const item: PendingVoiceMessage = {
      id: "voice-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
      conversationId: input.conversationId,
      mimeType: input.mimeType,
      bytes: await input.blob.arrayBuffer(),
      createdAt: Date.now(),
      attempts: 0,
    };
    const db = await openVoiceOutbox();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await requestResult(tx.objectStore(STORE_NAME).put(item));
      return item;
    } finally {
      db.close();
    }
    }

    export async function listPendingVoices(conversationId: number): Promise<PendingVoiceMessage[]> {
    const db = await openVoiceOutbox();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const values = await requestResult(tx.objectStore(STORE_NAME).index("conversationId").getAll(conversationId));
      return values.sort((a, b) => a.createdAt - b.createdAt);
    } finally {
      db.close();
    }
    }

    export async function updatePendingVoice(
    id: string,
    patch: Partial<Pick<PendingVoiceMessage, "mediaUrl" | "attempts" | "lastError">>,
    ): Promise<void> {
    const db = await openVoiceOutbox();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const current = await requestResult(store.get(id));
      if (current) await requestResult(store.put({ ...current, ...patch }));
    } finally {
      db.close();
    }
    }

    export async function removePendingVoice(id: string): Promise<void> {
    const db = await openVoiceOutbox();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await requestResult(tx.objectStore(STORE_NAME).delete(id));
    } finally {
      db.close();
    }
    }
    