import { describe, expect, it, vi } from 'vitest';
import {
  classifySharePointFolderProbe,
  ensureSharePointFolder,
  probeSharePointFolder,
  readSharePointFileBytes,
  sameSharePointPath,
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

  it('treats encoded and decoded SharePoint paths as the same identity', () => {
    expect(sameSharePointPath(
      '/sites/%D7%90%D7%AA%D7%A8%20%D7%91%D7%93%D7%99%D7%A7%D7%94',
      '/sites/אתר בדיקה',
    )).toBe(true);
  });
});

describe('SharePoint folder creation and file upload recovery', () => {
  it('reuses an existing list-backed folder without issuing a create request', async () => {
    const request = vi.fn(async ({ url }) => {
      if (url.includes('/ListItemAllFields')) {
        return response({ d: { Id: 8, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/existing' } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(ensureSharePointFolder({
      ...runtime,
      folderRel: '/sites/schedule/siteDB8/existing',
      request,
    })).resolves.toMatchObject({ existed: true, created: false });
    expect(request.mock.calls.some(([requestOptions]) => requestOptions.method === 'POST')).toBe(false);
  });

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

    it('recursively readies a missing parent before creating a nested folder', async () => {
      const readyPaths = new Set(['/sites/schedule/siteDB8']);
      const request = vi.fn(async ({ url, method }) => {
        if (url.includes("GetByTitle('siteDB8')")) {
          return response({ d: { Id: 'lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } });
        }
        const decodedUrl = decodeURIComponent(url);
        const pathMatch = decodedUrl.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/);
        const requestedPath = pathMatch?.[1] || '';
        if (method === 'GET' && url.includes('/ListItemAllFields')) {
          return readyPaths.has(requestedPath)
            ? response({ d: { Id: readyPaths.size + 10, FileSystemObjectType: 1, FileRef: requestedPath } })
            : response({ error: { message: { value: 'not found' } } }, 404);
        }
        if (method === 'GET' && pathMatch) {
          return response({ error: { message: { value: 'not found' } } }, 404);
        }
        if (method === 'POST' && url.includes('/Folders/add(')) {
          const leaf = decodedUrl.match(/\/Folders\/add\('([^']+)'\)/)?.[1];
          readyPaths.add(`${requestedPath}/${leaf}`);
          return response({ d: { ServerRelativeUrl: `${requestedPath}/${leaf}` } });
        }
        throw new Error(`Unexpected URL ${url}`);
      });

      await expect(ensureSharePointFolder({
        ...runtime,
        folderRel: '/sites/schedule/siteDB8/parent/child',
        request,
      })).resolves.toMatchObject({
        created: true,
        path: '/sites/schedule/siteDB8/parent/child',
        probe: { ready: true },
      });
      const createCalls = request.mock.calls.filter(([options]) => options.method === 'POST');
      expect(createCalls).toHaveLength(2);
      expect(decodeURIComponent(createCalls[0][0].url)).toContain("/Folders/add('parent')");
      expect(decodeURIComponent(createCalls[1][0].url)).toContain("/Folders/add('child')");
    });

    it('treats a duplicate-create response as idempotent when readiness verification succeeds', async () => {
      let duplicateVisible = false;
      const request = vi.fn(async ({ url, method }) => {
        if (url.includes("GetByTitle('siteDB8')")) {
          return response({ d: { Id: 'lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } });
        }
        if (url.includes('/ListItemAllFields')) {
          return duplicateVisible
            ? response({ d: { Id: 31, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/duplicate' } })
            : response({ error: { message: { value: 'not found' } } }, 404);
        }
        if (method === 'GET') return response({ error: { message: { value: 'not found' } } }, 404);
        if (method === 'POST' && url.includes('/Folders/add(')) {
          duplicateVisible = true;
          return response({ error: { message: { value: 'A folder with this name already exists' } } }, 409);
        }
        throw new Error(`Unexpected URL ${url}`);
      });

      await expect(ensureSharePointFolder({
        ...runtime,
        folderRel: '/sites/schedule/siteDB8/duplicate',
        request,
      })).resolves.toMatchObject({ path: '/sites/schedule/siteDB8/duplicate', probe: { ready: true } });
    });

    it('rejects a target outside the explicitly allowed parent library', async () => {
      const request = vi.fn();
      await expect(ensureSharePointFolder({
        ...runtime,
        folderRel: '/sites/schedule/otherLibrary/folder',
        request,
      })).rejects.toMatchObject({ code: 'FOLDER_OUTSIDE_CONFIGURED_LIBRARIES' });
      expect(request).not.toHaveBeenCalled();
    });

    it('requests JSON metadata and safely encodes URL-significant folder characters', async () => {
      const folderRel = '/sites/schedule/תוכן #100%/תיקייה #1%';
      const request = vi.fn(async () => response({
        d: {
          Id: 17,
          FileSystemObjectType: 1,
          FileRef: folderRel,
        },
      }));

      await expect(probeSharePointFolder({
        webUrl: '/sites/schedule',
        folderRel,
        libraries: [{ title: 'תוכן #100%', rootRel: '/sites/schedule/תוכן #100%' }],
        request,
      })).resolves.toMatchObject({ ready: true, actualPath: folderRel });

      expect(request).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json;odata=verbose' },
        url: expect.stringMatching(/%23.*%25/),
      }));
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
    const request = vi.fn(async ({ url }) => (
      url.includes("GetFileByServerRelativeUrl('/sites/schedule/")
        ? response('missing', 404, { 'content-type': 'text/plain' })
        : response('ok', 200, { 'content-type': 'application/octet-stream' })
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
    const request = vi.fn(async () => response({ d: { Id: 4, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/siteAssets' } }));
    await probeSharePointFolder({
      webUrl: runtime.webUrl,
      folderRel: '/sites/schedule/siteDB8/siteAssets',
      libraries: runtime.libraries,
      request,
    });
    expect(request.mock.calls[0][0].url).toContain('/ListItemAllFields');
  });
});
