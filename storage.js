import { siteStorageKey } from './logic.js';

export const storageKey = siteStorageKey(location.pathname);

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageKey, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('gift');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function previewStorage(value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('gift', value === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('gift');
      const req = value === undefined ? store.get('content') : store.put(value, 'content');
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Your browser could not save this preview.'));
    });
  } finally { db.close(); }
}
