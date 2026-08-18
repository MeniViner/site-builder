import { describe, expect, it, vi } from 'vitest';
import {
  classifySharePointFolderProbe,
  ensureSharePointFolder,
  probeSharePointFolder,
  readSharePointFileBytes,
  uploadSharePointFileBytes,
} from './sharePointBrowserFilesystem';

const response = (body, status = 200, headers = { 'content-type': 'application/json;odata=verbose' }) => new Response(
  typeof body === 'string' || body instanceof ArrayBuffer ? body : JSON.stringify(body),
  { status, headers },
);

const runtime = {
  webUrl: 'https://portal.army.idf/sites/schedule',
  siteRoot: '/sites/schedule',
  libraries: [
    { title: 'siteDB8', rootRel: '/sites/schedule/siteDB8' },
    { title: 'siteUsersDB8', rootRel: '/sites/schedule/siteUsersDB8' },
  ],
  digest: 'digest',
  retryDelaysMs: [0, 0, 0, 0],
  sleep: async () => {},
  log: () => {},
};

describe('SharePoint list-backed folder readiness', () => {
  it('does not treat a generic HTTP 200 folder object as writable', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: { d: { ServerRelativeUrl: '/sites/schedule/siteDB8/siteAssets' } },
      expectedPath: '/sites/schedule/siteDB8/siteAssets',
    })).toMatchObject({ ready: false, reason: 'LIST_BACKED_FOLDER_NOT_READY' });
  });

  it('accepts only an exact list-backed folder item', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: { d: { Id: 7, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/siteAssets' } },
      expectedPath: '/sites/schedule/siteDB8/siteAssets',
    })).toMatchObject({ ready: true, id: 7, reason: 'LIST_BACKED_FOLDER_READY' });
  });

  it('verifies configured library roots by BaseTemplate and exact RootFolder', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: { d: { Id: 'guid', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } },
      expectedPath: '/sites/schedule/siteDB8',
      libraryRoot: true,
    })).toMatchObject({ ready: true, reason: 'LIBRARY_ROOT_READY' });
  });
});

describe('SharePoint folder creation and file upload recovery', () => {
  it('creates child folders through the verified parent and waits for list metadata', async () => {
    let created = false;
    const request = vi.fn(async ({ url, method }) => {
      if (url.includes("GetByTitle('siteDB8')")) {
        return response({ d: { Id: 'lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } });
      }
      if (url.includes('/ListItemAllFields')) {
        return created
          ? response({ d: { Id: 12, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/siteAssets' } })
          : response({ error: { message: { value: 'not found' } } }, 404);
      }
      if (url.includes("GetFolderByServerRelativeUrl('/sites/schedule/siteDB8/siteAssets')?$select=")) {
        return response({ error: { message: { value: 'not found' } } }, 404);
      }
      if (method === 'POST' && url.includes("GetFolderByServerRelativeUrl('/sites/schedule/siteDB8')/Folders/add('siteAssets')")) {
        created = true;
        return response({ d: { ServerRelativeUrl: '/sites/schedule/siteDB8/siteAssets' } }, 200);
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(ensureSharePointFolder({
      ...runtime,
      folderRel: '/sites/schedule/siteDB8/siteAssets',
      request,
    })).resolves.toMatchObject({ created: true, path: '/sites/schedule/siteDB8/siteAssets' });
  });

  it('falls back from server-relative upload to web-relative upload after DirectoryNotFound', async () => {
    const request = vi.fn(async ({ url, method }) => {
      if (url.includes('/ListItemAllFields')) {
        return response({ d: { Id: 22, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/siteAssets' } });
      }
      if (method === 'POST' && url.includes("GetFolderByServerRelativeUrl('/sites/schedule/siteDB8/siteAssets')")) {
        return response({ error: { message: { value: 'System.IO.DirectoryNotFoundException: cannot find part of the path' } } }, 404);
      }
      if (method === 'POST' && url.includes("GetFolderByServerRelativeUrl('siteDB8/siteAssets')")) {
        return response({ d: { Name: 'bihs_master_config_v1.txt' } }, 200);
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(uploadSharePointFileBytes({
      ...runtime,
      folderRel: '/sites/schedule/siteDB8/siteAssets',
      fileName: 'bihs_master_config_v1.txt',
      bytes: new TextEncoder().encode('{}\n'),
      request,
    })).resolves.toMatchObject({ status: 200 });
  });

  it('uses the library RootFolder endpoint for files at the users-library root', async () => {
    const request = vi.fn(async ({ url, method }) => {
      if (method === 'GET' && url.includes("GetByTitle('siteUsersDB8')")) {
        return response({ d: { Id: 'users-lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteUsersDB8' } } });
      }
      if (method === 'POST' && url.includes("GetByTitle('siteUsersDB8')/RootFolder/Files/Add")) {
        return response({ d: { Name: 'widgets_data.txt' } }, 200);
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(uploadSharePointFileBytes({
      ...runtime,
      folderRel: '/sites/schedule/siteUsersDB8',
      fileName: 'widgets_data.txt',
      bytes: new TextEncoder().encode('{}\n'),
      request,
    })).resolves.toMatchObject({ status: 200 });
  });
});

describe('SharePoint file reads', () => {
  it('falls back to a web-relative file path after a full-path 404', async () => {
    const expected = new TextEncoder().encode('ok').buffer;
    const request = vi.fn(async ({ url }) => (
      url.includes("GetFileByServerRelativeUrl('/sites/schedule/")
        ? response('missing', 404, { 'content-type': 'text/plain' })
        : response(expected, 200, { 'content-type': 'application/octet-stream' })
    ));
    const result = await readSharePointFileBytes({
      webUrl: runtime.webUrl,
      siteRoot: runtime.siteRoot,
      fileRel: '/sites/schedule/siteDB8/siteAssets/file.txt',
      request,
    });
    expect(result.exists).toBe(true);
    expect(new TextDecoder().decode(result.bytes)).toBe('ok');
  });

  it('uses ListItemAllFields as the primary readiness probe', async () => {
    const request = vi.fn(async ({ url }) => response({ d: { Id: 4, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/siteAssets' } }));
    await probeSharePointFolder({
      webUrl: runtime.webUrl,
      folderRel: '/sites/schedule/siteDB8/siteAssets',
      libraries: runtime.libraries,
      request,
    });
    expect(request.mock.calls[0][0].url).toContain('/ListItemAllFields');
  });
});
