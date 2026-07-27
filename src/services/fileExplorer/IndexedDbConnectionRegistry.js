const DEFAULT_DATABASE_NAME = 'site-builder-file-explorer';
const DEFAULT_DATABASE_VERSION = 1;
const CONNECTION_STORE = 'connections';

export class IndexedDbConnectionRegistry {
  constructor({
    indexedDB = globalThis.indexedDB,
    databaseName = DEFAULT_DATABASE_NAME,
  } = {}) {
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
  }

  isSupported() {
    return Boolean(this.indexedDB?.open);
  }

  open() {
    if (!this.isSupported()) return Promise.reject(new Error('indexeddb_unavailable'));
    return new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, DEFAULT_DATABASE_VERSION);
      request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CONNECTION_STORE)) {
          const store = database.createObjectStore(CONNECTION_STORE, { keyPath: 'id' });
          store.createIndex('shareKey', 'shareKey', { unique: false });
          store.createIndex('canonicalPrefix', 'canonicalPrefix', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async withStore(mode, operation) {
    const database = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(CONNECTION_STORE, mode);
        const store = transaction.objectStore(CONNECTION_STORE);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error('indexeddb_transaction_failed'));
        transaction.onabort = () => reject(transaction.error || new Error('indexeddb_transaction_aborted'));
        const request = operation(store);
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error('indexeddb_request_failed'));
      });
    } finally {
      database.close();
    }
  }

  loadAll() {
    return this.withStore('readonly', (store) => store.getAll());
  }

  save(connection) {
    return this.withStore('readwrite', (store) => store.put(connection));
  }

  remove(id) {
    return this.withStore('readwrite', (store) => store.delete(id));
  }

  clear() {
    return this.withStore('readwrite', (store) => store.clear());
  }
}

export class MemoryConnectionRegistry {
  constructor(records = []) {
    this.records = new Map(records.map((record) => [record.id, record]));
  }

  isSupported() {
    return true;
  }

  async loadAll() {
    return [...this.records.values()];
  }

  async save(connection) {
    this.records.set(connection.id, connection);
    return connection.id;
  }

  async remove(id) {
    this.records.delete(id);
  }

  async clear() {
    this.records.clear();
  }
}
