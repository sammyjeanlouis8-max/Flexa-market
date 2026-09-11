const DATABASE = "flexa-video-uploads-v1";
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("jobs", { keyPath: "id" });
        request.result.createObjectStore("files");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close other Flexa Market tabs and try again."));
    }).catch((error) => { database = undefined; throw error; });
  }
  return database;
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = action(tx);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error ?? new Error("Could not save upload progress."));
  });
}

export const loadVideoJobs = <T>() =>
  transaction<T[]>(["jobs"], "readonly", (tx) => tx.objectStore("jobs").getAll());
export const saveVideoJob = (job: { id: string }) =>
  transaction(["jobs"], "readwrite", (tx) => tx.objectStore("jobs").put(job));
export const loadVideoFile = (id: string) =>
  transaction<Blob | undefined>(["files"], "readonly", (tx) => tx.objectStore("files").get(id));
export const removeVideoFile = (id: string) =>
  transaction(["files"], "readwrite", (tx) => tx.objectStore("files").delete(id));
export const saveNewVideoJob = (job: { id: string }, file: File) =>
  transaction(["jobs", "files"], "readwrite", (tx) => {
    tx.objectStore("files").put(file, job.id);
    return tx.objectStore("jobs").put(job);
  });
export const removeVideoJob = (id: string) =>
  transaction(["jobs", "files"], "readwrite", (tx) => {
    tx.objectStore("files").delete(id);
    return tx.objectStore("jobs").delete(id);
  });