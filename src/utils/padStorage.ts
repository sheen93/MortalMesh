import {
  createEmptyPadDocument,
  type PadDocumentV1,
  type PadStudyRecord,
} from '@/types/pad';

export const PAD_IDB_NAME = 'mortal-mesh-sketchbook-v1';
export const PAD_IDB_VERSION = 1;
export const PAD_AUTOSAVE_STORE = 'autosave';
export const PAD_STUDIES_STORE = 'studies';
const AUTOSAVE_RECORD_KEY = 'active';

function openPadDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(PAD_IDB_NAME, PAD_IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PAD_AUTOSAVE_STORE)) {
          db.createObjectStore(PAD_AUTOSAVE_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(PAD_STUDIES_STORE)) {
          db.createObjectStore(PAD_STUDIES_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function sanitizeDocument(raw: unknown): PadDocumentV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<PadDocumentV1>;
  if (obj.version !== 1 || !Array.isArray(obj.strokes)) return null;

  const base = createEmptyPadDocument(obj.paperTone ?? 'white');
  return {
    version: 1,
    updatedAt:
      typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    paperTone: obj.paperTone ?? base.paperTone,
    layers: {
      construction: obj.layers?.construction ?? base.layers.construction,
      ink: obj.layers?.ink ?? base.layers.ink,
      value: obj.layers?.value ?? base.layers.value,
    },
    strokes: obj.strokes.filter(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof s.id === 'string' &&
        Array.isArray(s.points)
    ),
  };
}

export async function loadPadAutosave(): Promise<PadDocumentV1 | null> {
  const db = await openPadDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PAD_AUTOSAVE_STORE, 'readonly');
      const store = tx.objectStore(PAD_AUTOSAVE_STORE);
      const req = store.get(AUTOSAVE_RECORD_KEY);
      req.onsuccess = () => {
        const entry = req.result as { key?: string; doc?: unknown } | undefined;
        resolve(sanitizeDocument(entry?.doc));
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

export async function savePadAutosave(doc: PadDocumentV1): Promise<void> {
  const db = await openPadDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PAD_AUTOSAVE_STORE, 'readwrite');
      const store = tx.objectStore(PAD_AUTOSAVE_STORE);
      store.put({ key: AUTOSAVE_RECORD_KEY, doc });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function savePadStudy(study: PadStudyRecord): Promise<void> {
  const db = await openPadDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PAD_STUDIES_STORE, 'readwrite');
      tx.objectStore(PAD_STUDIES_STORE).put(study);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function listPadStudies(): Promise<PadStudyRecord[]> {
  const db = await openPadDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PAD_STUDIES_STORE, 'readonly');
      const req = tx.objectStore(PAD_STUDIES_STORE).getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result)
          ? (req.result as PadStudyRecord[])
          : [];
        rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        db.close();
        resolve(rows);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

export async function deletePadStudy(id: string): Promise<void> {
  const db = await openPadDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PAD_STUDIES_STORE, 'readwrite');
      tx.objectStore(PAD_STUDIES_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
