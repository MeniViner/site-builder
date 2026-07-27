import BrowserFileSystemAdapter from './BrowserFileSystemAdapter';
import { MemoryConnectionRegistry } from './IndexedDbConnectionRegistry';

export class MockFileHandle {
  constructor(name, {
    lastModified = Date.now(),
    size = 0,
    type = 'application/octet-stream',
  } = {}) {
    this.kind = 'file';
    this.name = name;
    this.file = { lastModified, name, size, type };
  }

  async getFile() {
    return this.file;
  }
}

export class MockDirectoryHandle {
  constructor(name, entries = [], permission = 'granted') {
    this.kind = 'directory';
    this.name = name;
    this.permission = permission;
    this.entries = new Map(entries.map((entry) => [entry.name, entry]));
  }

  async *values() {
    yield* this.entries.values();
  }

  async getDirectoryHandle(name) {
    const entry = this.entries.get(name);
    if (!entry || entry.kind !== 'directory') throw new DOMException('Missing directory', 'NotFoundError');
    return entry;
  }

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    return this.permission;
  }
}

export class MockFileSystemAdapter extends BrowserFileSystemAdapter {
  constructor({
    connections = [],
    pickerHandles = [],
    registry = new MemoryConnectionRegistry(connections),
    windowObject,
  } = {}) {
    const queue = [...pickerHandles];
    const mockWindow = windowObject || {
      isSecureContext: true,
      open: () => null,
      setTimeout,
      showDirectoryPicker: async () => {
        if (!queue.length) throw new DOMException('Picker cancelled', 'AbortError');
        return queue.shift();
      },
    };
    super({
      registry,
      windowObject: mockWindow,
      documentObject: globalThis.document,
      urlApi: globalThis.URL,
    });
    this.pickerHandles = queue;
  }
}

export default MockFileSystemAdapter;
