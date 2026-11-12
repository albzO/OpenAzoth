/**
 * Tiny IndexedDB key/value store for data too large for localStorage
 * (an OLED animation can be ~1.3 MB; source images more). Values are structured-cloned,
 * so plain objects containing Uint8Arrays are fine. Failures resolve to null / no-op.
 */
// former project name, kept so existing data is still found
const DB = 'crateless';
const STORE = 'blobs';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function write(key: string, value: unknown, remove = false): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    if (remove) tx.objectStore(STORE).delete(key);
    else tx.objectStore(STORE).put(value, key);
    tx.oncomplete = tx.onerror = () => resolve();
  });
  db.close();
}

export const putValue = (key: string, value: unknown): Promise<void> => write(key, value);
export const deleteValue = (key: string): Promise<void> => write(key, null, true);

export async function getValue<T>(key: string): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  const v = await new Promise<unknown>((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  db.close();
  return (v ?? null) as T | null;
}

export const putBlob = (key: string, data: Uint8Array): Promise<void> => putValue(key, data);
export async function getBlob(key: string): Promise<Uint8Array | null> {
  const v = await getValue<unknown>(key);
  return v instanceof Uint8Array ? v : null;
}
