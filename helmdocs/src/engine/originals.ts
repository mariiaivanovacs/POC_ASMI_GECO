// The uploaded form file itself (PDF / DOCX / TXT / MD), kept in IndexedDB keyed by upload or template id, so the
// first step can show the real document and the export can write onto it. localStorage would overflow on PDFs.
export interface Original { name: string; ext: string; bytes: ArrayBuffer }

const DB = 'helmdocs-originals';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function putOriginal(id: string, o: Original): Promise<void> { await tx('readwrite', (s) => s.put(o, id)); }
export async function getOriginal(id: string): Promise<Original | null> { try { return ((await tx('readonly', (s) => s.get(id))) as Original | undefined) || null; } catch { return null; } }
export async function deleteOriginal(id: string): Promise<void> { try { await tx('readwrite', (s) => s.delete(id)); } catch { /* best effort */ } }
export async function moveOriginal(from: string, to: string): Promise<boolean> {
  const o = await getOriginal(from);
  if (!o) return false;
  await putOriginal(to, o);
  await deleteOriginal(from);
  return true;
}
