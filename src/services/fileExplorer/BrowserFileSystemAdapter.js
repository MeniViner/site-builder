import { IndexedDbConnectionRegistry } from './IndexedDbConnectionRegistry';
import {
  canonicalConnectionPrefix,
  displayConnectionPrefix,
  inferConnectionCandidates,
  remainingSegmentsForConnection,
  selectLongestPrefixConnection,
} from './connectionModel';

const READ_PERMISSION = Object.freeze({ mode: 'read' });
const DEFAULT_SEARCH_LIMITS = Object.freeze({
  maxDepth: 4,
  maxResults: 100,
  maxVisited: 1_500,
});
const BROWSER_OPEN_MIME_PREFIXES = ['audio/', 'image/', 'video/'];
const BROWSER_OPEN_MIME_TYPES = new Set([
  'application/json',
  'application/pdf',
  'application/xml',
  'image/svg+xml',
  'text/css',
  'text/csv',
  'text/markdown',
  'text/plain',
  'text/xml',
]);
const BROWSER_OPEN_EXTENSIONS = new Set([
  'aac',
  'css',
  'csv',
  'flac',
  'gif',
  'jpeg',
  'jpg',
  'js',
  'json',
  'log',
  'm4a',
  'md',
  'mjs',
  'mov',
  'mp3',
  'mp4',
  'ogg',
  'pdf',
  'png',
  'txt',
  'webm',
  'webp',
  'xml',
  'yaml',
  'yml',
]);
const FILE_KIND_EXTENSIONS = Object.freeze({
  archive: new Set(['7z', 'gz', 'rar', 'tar', 'zip']),
  audio: new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav']),
  code: new Set(['css', 'js', 'jsx', 'json', 'md', 'mjs', 'ts', 'tsx', 'xml', 'yaml', 'yml']),
  document: new Set(['doc', 'docx', 'odt', 'pages', 'rtf']),
  image: new Set(['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']),
  pdf: new Set(['pdf']),
  presentation: new Set(['key', 'ppt', 'pptx']),
  sheet: new Set(['csv', 'numbers', 'ods', 'xls', 'xlsx']),
  text: new Set(['log', 'txt']),
  video: new Set(['avi', 'mkv', 'mov', 'mp4', 'webm']),
});

function nowIso() {
  return new Date().toISOString();
}

function fileExtension(name) {
  const match = String(name || '').toLocaleLowerCase('en-US').match(/\.([^.]+)$/u);
  return match?.[1] || '';
}

function fileKind(name, isDirectory = false) {
  if (isDirectory) return 'folder';
  const extension = fileExtension(name);
  return Object.entries(FILE_KIND_EXTENSIONS)
    .find(([, extensions]) => extensions.has(extension))?.[0] || 'file';
}

export function classifyFileAction(file) {
  const type = String(file?.type || '').toLocaleLowerCase('en-US');
  return BROWSER_OPEN_EXTENSIONS.has(fileExtension(file?.name))
    || BROWSER_OPEN_MIME_PREFIXES.some((prefix) => type.startsWith(prefix))
    || BROWSER_OPEN_MIME_TYPES.has(type)
    ? 'preview'
    : 'download';
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `connection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isNotFoundError(error) {
  return error?.name === 'NotFoundError' || error?.code === 'not_found';
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
}

export class BrowserFileSystemAdapter {
  constructor({
    registry = new IndexedDbConnectionRegistry(),
    windowObject = globalThis.window,
    documentObject = globalThis.document,
    navigatorObject = globalThis.navigator,
    urlApi = globalThis.URL,
  } = {}) {
    this.registry = registry;
    this.window = windowObject;
    this.document = documentObject;
    this.navigator = navigatorObject;
    this.urlApi = urlApi;
  }

  isSupported() {
    return Boolean(
      this.registry?.isSupported?.()
      && this.window?.isSecureContext
      && typeof this.window?.showDirectoryPicker === 'function',
    );
  }

  async queryPermission(handle) {
    if (typeof handle?.queryPermission !== 'function') return 'prompt';
    return handle.queryPermission(READ_PERMISSION);
  }

  async requestPermission(handle) {
    if (typeof handle?.requestPermission !== 'function') return 'denied';
    return handle.requestPermission(READ_PERMISSION);
  }

  async loadConnections() {
    const connections = await this.registry.loadAll();
    return [...connections].sort((left, right) => (
      String(right.lastUsedAt || right.createdAt || '')
        .localeCompare(String(left.lastUsedAt || left.createdAt || ''))
    ));
  }

  async saveConnection(connection) {
    await this.registry.save(connection);
    return connection;
  }

  async removeConnection(connectionOrId) {
    const id = typeof connectionOrId === 'string' ? connectionOrId : connectionOrId?.id;
    if (id) await this.registry.remove(id);
  }

  async copyText(value) {
    const text = String(value || '');
    if (typeof this.navigator?.clipboard?.writeText === 'function') {
      await this.navigator.clipboard.writeText(text);
      return text;
    }

    const textarea = this.document?.createElement?.('textarea');
    if (!textarea || typeof this.document?.execCommand !== 'function') {
      throw new Error('clipboard_unavailable');
    }
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    this.document.body.append(textarea);
    let copied = false;
    try {
      textarea.select();
      copied = this.document.execCommand('copy');
    } finally {
      textarea.remove();
    }
    if (!copied) throw new Error('clipboard_copy_failed');
    return text;
  }

  async resolveDirectory(directoryHandle, segments = []) {
    let current = directoryHandle;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create: false });
    }
    return current;
  }

  async getFileMetadata(fileHandle) {
    const file = await fileHandle.getFile();
    return {
      fileHandle,
      isDirectory: false,
      kind: fileKind(file.name || fileHandle.name),
      lastModified: file.lastModified || 0,
      modifiedIso: file.lastModified ? new Date(file.lastModified).toISOString() : '',
      name: file.name || fileHandle.name,
      action: classifyFileAction(file),
      size: Number(file.size || 0),
      type: file.type || '',
    };
  }

  async listDirectory(directoryHandle) {
    const entries = [];
    for await (const entry of directoryHandle.values()) {
      if (entry.kind === 'directory') {
        entries.push({
          directoryHandle: entry,
          isDirectory: true,
          kind: 'folder',
          modifiedIso: '',
          name: entry.name,
          size: null,
          type: 'תיקייה',
        });
      } else if (entry.kind === 'file') {
        entries.push(await this.getFileMetadata(entry));
      }
    }
    return entries.sort((left, right) => (
      Number(right.isDirectory) - Number(left.isDirectory)
      || left.name.localeCompare(right.name, 'he', { numeric: true, sensitivity: 'base' })
    ));
  }

  async openFile(fileHandle) {
    const file = await fileHandle.getFile();
    const objectUrl = this.urlApi.createObjectURL(file);
    const metadata = {
      kind: fileKind(file.name),
      modifiedIso: file.lastModified ? new Date(file.lastModified).toISOString() : '',
      name: file.name,
      size: file.size,
      type: file.type || '',
    };

    if (classifyFileAction(file) === 'preview') {
      this.window.open(objectUrl, '_blank', 'noopener,noreferrer');
      this.window.setTimeout(() => this.urlApi.revokeObjectURL(objectUrl), 60_000);
      return { action: 'previewed', metadata };
    }

    const anchor = this.document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.rel = 'noopener';
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    this.window.setTimeout(() => this.urlApi.revokeObjectURL(objectUrl), 1_000);
    return { action: 'downloaded', metadata };
  }

  async resolveTarget(target, { connections: suppliedConnections } = {}) {
    if (target?.kind !== 'unc') return { status: 'invalid-target' };
    const connections = suppliedConnections || await this.loadConnections();
    const connection = selectLongestPrefixConnection(target, connections);
    if (!connection) return { connections, status: 'no-connection' };

    const permission = await this.queryPermission(connection.directoryHandle);
    if (permission !== 'granted') {
      return {
        connection,
        connections,
        permission,
        status: permission === 'denied' ? 'permission-denied' : 'permission-prompt',
      };
    }

    const remainingSegments = remainingSegmentsForConnection(connection, target);
    try {
      const directoryHandle = await this.resolveDirectory(connection.directoryHandle, remainingSegments);
      const updatedConnection = {
        ...connection,
        lastUsedAt: nowIso(),
      };
      await this.saveConnection(updatedConnection);
      return {
        connection: updatedConnection,
        connections: connections.map((item) => (item.id === updatedConnection.id ? updatedConnection : item)),
        directoryHandle,
        permission,
        remainingSegments,
        status: 'connected',
      };
    } catch (error) {
      return {
        connection,
        connections,
        error,
        permission,
        remainingSegments,
        status: isNotFoundError(error) ? 'directory-not-found' : 'connection-error',
      };
    }
  }

  async connectDirectory(target) {
    if (target?.kind !== 'unc') return { status: 'invalid-target' };
    const directoryHandle = await this.window.showDirectoryPicker({ mode: 'read' });
    const inference = inferConnectionCandidates(target, directoryHandle.name);
    if (inference.status === 'choice-required') {
      return {
        candidates: inference.candidates,
        directoryHandle,
        status: 'mapping-choice',
        target,
      };
    }
    if (inference.status === 'confirmation-required') {
      return {
        candidate: inference.candidates[0],
        directoryHandle,
        status: 'mapping-confirmation',
        target,
      };
    }
    return this.completeConnection(target, directoryHandle, inference.candidates[0]);
  }

  async reconnectConnection(connection) {
    const target = {
      kind: 'unc',
      segments: [...(connection?.prefixSegments || [])],
      server: connection?.server,
      share: connection?.share,
      shareKey: connection?.shareKey,
    };
    if (!target.server || !target.share || !target.shareKey) return { status: 'invalid-target' };
    return this.connectDirectory(target);
  }

  async completeConnection(target, directoryHandle, candidate, { label = '' } = {}) {
    const resolvedDirectoryHandle = await this.resolveDirectory(
      directoryHandle,
      candidate.remainingSegments,
    );
    const existingConnections = await this.loadConnections();
    const existing = existingConnections.find((connection) => (
      connection.canonicalPrefix === candidate.canonicalPrefix
    ));
    const createdAt = existing?.createdAt || nowIso();
    const connection = {
      canonicalPrefix: candidate.canonicalPrefix || canonicalConnectionPrefix(target, candidate.prefixSegments),
      connectionMode: candidate.connectionMode,
      createdAt,
      directoryHandle,
      displayPrefix: candidate.displayPrefix || displayConnectionPrefix(target, candidate.prefixSegments),
      id: existing?.id || makeId(),
      label: String(label || '').trim() || candidate.displayPrefix,
      lastUsedAt: nowIso(),
      prefixSegments: [...candidate.prefixSegments],
      server: target.server,
      share: target.share,
      shareKey: target.shareKey,
    };
    await this.saveConnection(connection);
    return {
      connection,
      directoryHandle: resolvedDirectoryHandle,
      remainingSegments: [...candidate.remainingSegments],
      status: 'connected',
    };
  }

  async testConnection(connection) {
    const permission = await this.queryPermission(connection?.directoryHandle);
    if (permission !== 'granted') return { permission, status: permission === 'denied' ? 'denied' : 'permission-required' };
    try {
      for await (const _entry of connection.directoryHandle.values()) {
        void _entry;
        break;
      }
      const updatedConnection = { ...connection, lastUsedAt: nowIso() };
      await this.saveConnection(updatedConnection);
      return { connection: updatedConnection, permission, status: 'available' };
    } catch (error) {
      return { error, permission, status: isNotFoundError(error) ? 'stale' : 'unavailable' };
    }
  }

  async searchDirectory(directoryHandle, query, {
    maxDepth = DEFAULT_SEARCH_LIMITS.maxDepth,
    maxResults = DEFAULT_SEARCH_LIMITS.maxResults,
    maxVisited = DEFAULT_SEARCH_LIMITS.maxVisited,
    onProgress,
    recursive = false,
    signal,
  } = {}) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase('he');
    if (!normalizedQuery) return { results: [], truncated: false, visited: 0 };
    const queue = [{ depth: 0, handle: directoryHandle, relativeSegments: [] }];
    const results = [];
    let visited = 0;

    while (queue.length && visited < maxVisited && results.length < maxResults) {
      abortIfNeeded(signal);
      const current = queue.shift();
      for await (const entry of current.handle.values()) {
        abortIfNeeded(signal);
        visited += 1;
        const relativeSegments = [...current.relativeSegments, entry.name];
        if (entry.name.toLocaleLowerCase('he').includes(normalizedQuery)) {
          results.push(entry.kind === 'directory'
            ? {
              directoryHandle: entry,
              isDirectory: true,
              kind: 'folder',
              modifiedIso: '',
              name: entry.name,
              relativeSegments,
              size: null,
              type: 'תיקייה',
            }
            : {
              ...await this.getFileMetadata(entry),
              relativeSegments,
            });
        }
        if (recursive && entry.kind === 'directory' && current.depth < maxDepth) {
          queue.push({
            depth: current.depth + 1,
            handle: entry,
            relativeSegments,
          });
        }
        if (visited % 50 === 0) {
          onProgress?.({ results: results.length, visited });
          await new Promise((resolve) => this.window.setTimeout(resolve, 0));
        }
        if (visited >= maxVisited || results.length >= maxResults) break;
      }
      if (!recursive) break;
    }

    onProgress?.({ results: results.length, visited });
    return {
      results,
      truncated: visited >= maxVisited || results.length >= maxResults,
      visited,
    };
  }
}

export default BrowserFileSystemAdapter;
