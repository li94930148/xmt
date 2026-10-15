export interface PendingCollaborationUpdate {
  id: number;
  update: Uint8Array;
  createdAt: number;
}

export interface CollaborationUpdateOutbox {
  list(userId: number, roomId: string): Promise<PendingCollaborationUpdate[]>;
  append(userId: number, roomId: string, update: Uint8Array): Promise<number>;
  remove(userId: number, roomId: string, ids: number[]): Promise<void>;
}

const DATABASE_NAME = 'xmt-collaboration-outbox';
const DATABASE_VERSION = 1;
const UPDATE_STORE = 'pending-updates';
const SCOPE_INDEX = 'account-room';
const MAX_PENDING_UPDATES_PER_ROOM = 5000;
const MAX_PENDING_BYTES_PER_ROOM = 32 * 1024 * 1024;

interface StoredUpdate {
  id?: number;
  userId: number;
  roomId: string;
  update: Uint8Array;
  createdAt: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(UPDATE_STORE)) {
        const store = database.createObjectStore(UPDATE_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex(SCOPE_INDEX, ['userId', 'roomId'], { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Could not open collaboration update storage'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Collaboration update storage is blocked by another browser tab'));
    };
  });
  return databasePromise;
}

function scopeRange(userId: number, roomId: string) {
  return IDBKeyRange.only([userId, roomId]);
}

export class IndexedDbUpdateOutbox implements CollaborationUpdateOutbox {
  async list(userId: number, roomId: string): Promise<PendingCollaborationUpdate[]> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(UPDATE_STORE, 'readonly');
      const request = transaction.objectStore(UPDATE_STORE)
        .index(SCOPE_INDEX)
        .getAll(scopeRange(userId, roomId)) as IDBRequest<StoredUpdate[]>;
      request.onsuccess = () => {
        const entries = request.result
          .filter((entry): entry is StoredUpdate & { id: number } => typeof entry.id === 'number')
          .sort((left, right) => left.id - right.id)
          .map((entry) => ({
            id: entry.id,
            update: new Uint8Array(entry.update),
            createdAt: entry.createdAt,
          }));
        resolve(entries);
      };
      request.onerror = () => reject(request.error || new Error('Could not read collaboration updates'));
      transaction.onerror = () => reject(transaction.error || new Error('Could not read collaboration updates'));
    });
  }

  async append(userId: number, roomId: string, update: Uint8Array): Promise<number> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(UPDATE_STORE, 'readwrite');
      const store = transaction.objectStore(UPDATE_STORE);
      const request = store.index(SCOPE_INDEX).getAll(scopeRange(userId, roomId)) as IDBRequest<StoredUpdate[]>;
      let insertedId: number | null = null;
      let failure: Error | null = null;

      request.onsuccess = () => {
        const entries = request.result;
        const pendingBytes = entries.reduce((total, entry) => total + entry.update.byteLength, 0);
        if (entries.length >= MAX_PENDING_UPDATES_PER_ROOM || pendingBytes + update.byteLength > MAX_PENDING_BYTES_PER_ROOM) {
          failure = new Error('Local collaboration update storage reached its per-room safety limit');
          transaction.abort();
          return;
        }

        const addRequest = store.add({
          userId,
          roomId,
          update: update.slice(),
          createdAt: Date.now(),
        } satisfies StoredUpdate);
        addRequest.onsuccess = () => {
          insertedId = Number(addRequest.result);
        };
        addRequest.onerror = () => {
          failure = addRequest.error || new Error('Could not save collaboration update locally');
        };
      };
      request.onerror = () => {
        failure = request.error || new Error('Could not inspect pending collaboration updates');
      };
      transaction.oncomplete = () => {
        if (insertedId === null) {
          reject(failure || new Error('Collaboration update was not saved locally'));
          return;
        }
        resolve(insertedId);
      };
      transaction.onabort = () => reject(failure || transaction.error || new Error('Could not save collaboration update locally'));
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not save collaboration update locally'));
    });
  }

  async remove(userId: number, roomId: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(UPDATE_STORE, 'readwrite');
      const store = transaction.objectStore(UPDATE_STORE);
      const cursorRequest = store.index(SCOPE_INDEX).openCursor(scopeRange(userId, roomId));
      const idSet = new Set(ids);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const entry = cursor.value as StoredUpdate;
        if (typeof entry.id === 'number' && idSet.has(entry.id)) cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error || new Error('Could not clean confirmed collaboration updates'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not clean confirmed collaboration updates'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not clean confirmed collaboration updates'));
    });
  }
}

export const collaborationUpdateOutbox: CollaborationUpdateOutbox = new IndexedDbUpdateOutbox();
