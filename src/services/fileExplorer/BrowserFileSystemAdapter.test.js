import { describe, expect, it, vi } from 'vitest';
import { parseFileExplorerTarget } from '../../utils/fileExplorerTargets';
import BrowserFileSystemAdapter, { classifyFileAction } from './BrowserFileSystemAdapter';
import { MemoryConnectionRegistry } from './IndexedDbConnectionRegistry';
import { MockDirectoryHandle, MockFileHandle } from './MockFileSystemAdapter';

function tree() {
  return new MockDirectoryHandle('Team Share', [
    new MockDirectoryHandle('Alpha', [
      new MockDirectoryHandle('Beta', [
        new MockDirectoryHandle('Reports', [
          new MockFileHandle('דוח 2026.pdf', { size: 42, type: 'application/pdf' }),
          new MockDirectoryHandle('Empty'),
        ]),
      ]),
    ]),
  ]);
}

function adapterWithPicker(directoryHandle, registry = new MemoryConnectionRegistry()) {
  const windowObject = {
    isSecureContext: true,
    setTimeout,
    showDirectoryPicker: vi.fn(async () => directoryHandle),
  };
  return new BrowserFileSystemAdapter({
    registry,
    windowObject,
  });
}

describe('BrowserFileSystemAdapter', () => {
  const target = parseFileExplorerTarget('\\\\Server\\Team Share\\Alpha\\Beta\\Reports');

  it('connects a picked share root, validates descendants, and resolves it later', async () => {
    const registry = new MemoryConnectionRegistry();
    const adapter = adapterWithPicker(tree(), registry);
    const connected = await adapter.connectDirectory(target);
    expect(connected).toMatchObject({
      remainingSegments: ['Alpha', 'Beta', 'Reports'],
      status: 'connected',
    });
    expect(connected.connection).toMatchObject({
      connectionMode: 'share-root',
      prefixSegments: [],
      shareKey: target.shareKey,
    });

    const resolved = await adapter.resolveTarget(target);
    expect(resolved).toMatchObject({ permission: 'granted', status: 'connected' });
    expect(resolved.directoryHandle.name).toBe('Reports');
    expect((await adapter.listDirectory(resolved.directoryHandle)).map((entry) => entry.name))
      .toEqual(['Empty', 'דוח 2026.pdf']);
  });

  it('does not save an inferred mapping when remaining descendants do not exist', async () => {
    const registry = new MemoryConnectionRegistry();
    const adapter = adapterWithPicker(new MockDirectoryHandle('Team Share'), registry);
    await expect(adapter.connectDirectory(target)).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(await registry.loadAll()).toEqual([]);
  });

  it('supports intermediate-prefix and exact-folder mappings', async () => {
    const root = tree();
    const alpha = await root.getDirectoryHandle('Alpha');
    const beta = await alpha.getDirectoryHandle('Beta');
    const reports = await beta.getDirectoryHandle('Reports');

    const intermediate = await adapterWithPicker(beta).connectDirectory(target);
    expect(intermediate).toMatchObject({
      connection: {
        connectionMode: 'intermediate-prefix',
        prefixSegments: ['Alpha', 'Beta'],
      },
      directoryHandle: reports,
      remainingSegments: ['Reports'],
      status: 'connected',
    });

    const exact = await adapterWithPicker(reports).connectDirectory(target);
    expect(exact).toMatchObject({
      connection: {
        connectionMode: 'folder-prefix',
        prefixSegments: ['Alpha', 'Beta', 'Reports'],
      },
      directoryHandle: reports,
      remainingSegments: [],
      status: 'connected',
    });
  });

  it('resolves Unicode and space-containing child names and accepts an empty folder', async () => {
    const unicodeTarget = parseFileExplorerTarget('\\\\שרת-01\\שיתוף צוות\\תיקייה עם רווחים\\ריקה');
    const empty = new MockDirectoryHandle('ריקה');
    const root = new MockDirectoryHandle('שיתוף צוות', [
      new MockDirectoryHandle('תיקייה עם רווחים', [empty]),
    ]);
    const adapter = adapterWithPicker(root);
    const connected = await adapter.connectDirectory(unicodeTarget);
    expect(connected.directoryHandle).toBe(empty);
    expect(await adapter.listDirectory(empty)).toEqual([]);
  });

  it('accepts folders containing only files or only child directories', async () => {
    const adapter = adapterWithPicker(tree());
    const onlyFiles = new MockDirectoryHandle('עברית וקבצים', [
      new MockFileHandle('מסמך mixed name.txt', { type: 'text/plain' }),
    ]);
    const onlyDirectories = new MockDirectoryHandle('Folders only', [
      new MockDirectoryHandle('תיקיית משנה'),
    ]);
    await expect(adapter.listDirectory(onlyFiles)).resolves.toMatchObject([
      { action: 'preview', isDirectory: false, name: 'מסמך mixed name.txt' },
    ]);
    await expect(adapter.listDirectory(onlyDirectories)).resolves.toMatchObject([
      { isDirectory: true, name: 'תיקיית משנה' },
    ]);
  });

  it('returns explicit prompt and denied permission states without listing', async () => {
    for (const permission of ['prompt', 'denied']) {
      const root = tree();
      root.permission = permission;
      const registry = new MemoryConnectionRegistry([{
        canonicalPrefix: target.shareKey,
        connectionMode: 'share-root',
        createdAt: '2026-07-27T08:00:00.000Z',
        directoryHandle: root,
        displayPrefix: '\\\\Server\\Team Share',
        id: `permission-${permission}`,
        label: 'Team Share',
        lastUsedAt: '2026-07-27T08:00:00.000Z',
        prefixSegments: [],
        shareKey: target.shareKey,
      }]);
      const adapter = adapterWithPicker(root, registry);
      expect(await adapter.resolveTarget(target)).toMatchObject({
        permission,
        status: permission === 'denied' ? 'permission-denied' : 'permission-prompt',
      });
    }
  });

  it('enforces recursive search limits, reports progress, and supports cancellation', async () => {
    const adapter = adapterWithPicker(tree());
    const reports = await adapter.resolveDirectory(tree(), ['Alpha', 'Beta', 'Reports']);
    const progress = vi.fn();
    const result = await adapter.searchDirectory(reports, 'דוח', {
      maxDepth: 2,
      maxResults: 10,
      maxVisited: 10,
      onProgress: progress,
      recursive: true,
    });
    expect(result.results).toMatchObject([{ name: 'דוח 2026.pdf' }]);
    expect(progress).toHaveBeenCalledWith({ results: 1, visited: 2 });

    const controller = new AbortController();
    controller.abort();
    await expect(adapter.searchDirectory(reports, 'דוח', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('removes saved connections through the adapter boundary', async () => {
    const registry = new MemoryConnectionRegistry([{ id: 'remove-me' }]);
    const adapter = adapterWithPicker(tree(), registry);
    await adapter.removeConnection('remove-me');
    expect(await adapter.loadConnections()).toEqual([]);
  });

  it('reports a stale saved connection when its directory can no longer be read', async () => {
    const staleHandle = {
      name: 'Team Share',
      queryPermission: async () => 'granted',
      async *values() {
        yield await Promise.reject(new DOMException('Missing directory', 'NotFoundError'));
      },
    };
    const adapter = adapterWithPicker(staleHandle);
    expect(await adapter.testConnection({ directoryHandle: staleHandle, id: 'stale' }))
      .toMatchObject({ permission: 'granted', status: 'stale' });
  });

  it('opens browser-supported files and downloads unsupported files with safe URL cleanup', async () => {
    const open = vi.fn();
    const timeout = vi.fn((callback) => callback());
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:site-builder-test'),
      revokeObjectURL: vi.fn(),
    };
    const anchor = { click: vi.fn(), remove: vi.fn() };
    const documentObject = {
      body: { append: vi.fn() },
      createElement: vi.fn(() => anchor),
    };
    const adapter = new BrowserFileSystemAdapter({
      documentObject,
      registry: new MemoryConnectionRegistry(),
      urlApi,
      windowObject: { isSecureContext: true, open, setTimeout: timeout },
    });

    const pdf = new File(['pdf'], 'דוח.pdf', { type: 'application/pdf' });
    expect(await adapter.openFile({ getFile: async () => pdf })).toMatchObject({ action: 'previewed' });
    expect(open).toHaveBeenCalledWith('blob:site-builder-test', '_blank', 'noopener,noreferrer');

    const workbook = new File(['sheet'], 'נתונים.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(await adapter.openFile({ getFile: async () => workbook })).toMatchObject({ action: 'downloaded' });
    expect(anchor).toMatchObject({
      download: 'נתונים.xlsx',
      href: 'blob:site-builder-test',
      rel: 'noopener',
    });
    expect(anchor.click).toHaveBeenCalled();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:site-builder-test');
  });

  it.each([
    ['notes.txt', '', 'preview'],
    ['photo.jpg', 'image/jpeg', 'preview'],
    ['manual.pdf', 'application/pdf', 'preview'],
    ['sound.mp3', 'audio/mpeg', 'preview'],
    ['movie.mp4', 'video/mp4', 'preview'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'download'],
    ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'download'],
    ['archive.zip', 'application/zip', 'download'],
    ['payload.bin', 'application/octet-stream', 'download'],
    ['unsafe.html', 'text/html', 'download'],
  ])('classifies %s as %s', (name, type, expected) => {
    expect(classifyFileAction({ name, type })).toBe(expected);
  });

  it('copies an exact UNC path through the async clipboard on a user action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const adapter = new BrowserFileSystemAdapter({
      navigatorObject: { clipboard: { writeText } },
      registry: new MemoryConnectionRegistry(),
      windowObject: { isSecureContext: true },
    });
    const path = '\\\\Server\\Team Share';
    await expect(adapter.copyText(path)).resolves.toBe(path);
    expect(writeText).toHaveBeenCalledWith(path);
  });

  it('uses a contained fallback copy operation when the clipboard API is unavailable', async () => {
    const textarea = {
      remove: vi.fn(),
      select: vi.fn(),
      setAttribute: vi.fn(),
      style: {},
      value: '',
    };
    const documentObject = {
      body: { append: vi.fn() },
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true),
    };
    const adapter = new BrowserFileSystemAdapter({
      documentObject,
      navigatorObject: {},
      registry: new MemoryConnectionRegistry(),
      windowObject: { isSecureContext: true },
    });
    const path = '\\\\שרת\\שיתוף צוות';
    await expect(adapter.copyText(path)).resolves.toBe(path);
    expect(textarea.value).toBe(path);
    expect(documentObject.execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalled();
  });
});
