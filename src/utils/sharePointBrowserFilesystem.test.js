import { describe, expect, it, vi } from 'vitest';
import folderContractFixtures from '../../test-fixtures/sharepoint-folder-contract.json';
import {
  SharePointBrowserFilesystemError,
  classifySharePointFolderProbe,
  createSharePointFolderInLibraryViaJsom,
  diagnoseSharePointFolders,
  ensureSharePointFolder,
  isSharePointFileMissingResponse,
  normalizeSharePointPath,
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

function probeResponseFor(url, readyPaths, libraries = runtime.libraries) {
  const decodedUrl = decodeURIComponent(url);
  const library = libraries.find(({ title }) => decodedUrl.includes(`GetByTitle('${title}')`));
  if (library && !decodedUrl.includes('/RootFolder/Files/')) {
    return response({
      d: {
        Id: library.id || `${library.title}-guid`,
        Title: library.title,
        BaseTemplate: 101,
        RootFolder: { ServerRelativeUrl: library.rootRel },
      },
    });
  }

  const pathMatch = decodedUrl.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/);
  const requestedPath = pathMatch?.[1] || '';
  if (decodedUrl.includes('/ListItemAllFields')) {
    return readyPaths.has(requestedPath)
      ? response({
        d: {
          Id: [...readyPaths].indexOf(requestedPath) + 10,
          FileSystemObjectType: 1,
          FileRef: requestedPath,
          FileDirRef: requestedPath.slice(0, requestedPath.lastIndexOf('/')),
        },
      })
      : response({ error: { message: { value: 'not found' } } }, 404);
  }
  if (decodedUrl.includes('/Folders?')) {
    const children = [...readyPaths]
      .filter((path) => path.slice(0, path.lastIndexOf('/')) === requestedPath)
      .map((path) => ({
        Name: path.split('/').pop(),
        ServerRelativeUrl: path,
        Exists: true,
        ListItemAllFields: {
          Id: [...readyPaths].indexOf(path) + 10,
          FileSystemObjectType: 1,
          FileRef: path,
          FileDirRef: requestedPath,
        },
      }));
    return response({ d: { results: children } });
  }
  if (pathMatch && String(url).includes('?$select=')) {
    return readyPaths.has(requestedPath)
      ? response({ d: { Exists: true, ServerRelativeUrl: requestedPath } })
      : response({ error: { message: { value: 'not found' } } }, 404);
  }
  return null;
}

describe('SharePoint list-backed folder readiness', () => {
  it.each(folderContractFixtures)('matches the cross-repository contract fixture: $name', (fixture) => {
    expect(classifySharePointFolderProbe(fixture)).toMatchObject(fixture.expected);
  });

  it('does not treat a generic HTTP 200 folder object as writable', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: { d: { ServerRelativeUrl: '/sites/schedule/siteDB8/siteAssets' } },
      expectedPath: '/sites/schedule/siteDB8/siteAssets',
    })).toMatchObject({ ready: false, reason: 'FOLDER_LIST_ITEM_ID_UNCONFIRMED' });
  });

  it('accepts only an exact list-backed folder item', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: { d: { Id: 7, FileSystemObjectType: 1, FileRef: '/sites/schedule/siteDB8/siteAssets' } },
      expectedPath: '/sites/schedule/siteDB8/siteAssets',
    })).toMatchObject({ ready: true, id: 7, reason: 'LIST_BACKED_FOLDER_READY' });
  });

  it('does not infer folder type when FileSystemObjectType is absent', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: { d: { Id: 7, FileRef: '/sites/schedule/siteDB8/siteAssets' } },
      expectedPath: '/sites/schedule/siteDB8/siteAssets',
    })).toMatchObject({
      ready: false,
      exists: true,
      reason: 'FOLDER_OBJECT_TYPE_UNCONFIRMED',
    });
  });

  it('treats an explicit Exists:false as missing even when SharePoint returns HTTP 200', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: {
        d: {
          Exists: false,
          ServerRelativeUrl: '/sites/schedule/siteDB8/missing',
        },
      },
      expectedPath: '/sites/schedule/siteDB8/missing',
      probeKind: 'folder-object',
    })).toMatchObject({
      ready: false,
      exists: false,
      reason: 'FOLDER_NOT_FOUND',
    });
  });

  it('classifies an exact item returned for another path as inconsistent metadata', () => {
    expect(classifySharePointFolderProbe({
      status: 200,
      payload: {
        d: {
          Id: 7,
          FileSystemObjectType: 1,
          FileRef: '/sites/schedule/siteDB8/somewhere-else',
        },
      },
      expectedPath: '/sites/schedule/siteDB8/siteAssets',
    })).toMatchObject({
      ready: false,
      exists: true,
      reason: 'FOLDER_PATH_MISMATCH',
    });
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
      'https://portal.example/sites/%D7%90%D7%AA%D7%A8%20%D7%91%D7%93%D7%99%D7%A7%D7%94',
      '/sites/אתר בדיקה',
    )).toBe(true);
  });

  it('preserves literal percent sequences in server-relative physical names', () => {
    expect(normalizeSharePointPath('/sites/example/library/report%20final.png'))
      .toBe('/sites/example/library/report%20final.png');
  });

  it('reports an incomplete folder object as existing but not ready', async () => {
    const request = vi.fn(async ({ url }) => (
      url.includes('/ListItemAllFields')
        ? response({ error: { message: { value: 'not found' } } }, 404)
        : url.includes("GetByTitle('siteDB8')")
          ? response({ d: { Id: 'lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } })
          : response({
            d: {
              Exists: true,
              ServerRelativeUrl: '/sites/schedule/siteDB8/ממתין',
            },
          }, 200)
    ));

    await expect(probeSharePointFolder({
      ...runtime,
      folderRel: '/sites/schedule/siteDB8/ממתין',
      request,
    })).resolves.toMatchObject({
      ready: false,
      exists: true,
      reason: 'FOLDER_OBJECT_VISIBLE_WAITING_FOR_LIST_ITEM',
    });
  });

  it('surfaces fallback authorization instead of burying it beneath a missing list item', async () => {
    const request = vi.fn(async ({ url }) => {
      if (url.includes("GetByTitle('siteDB8')")) {
        return response({ d: { Id: 'lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } });
      }
      if (url.includes('/ListItemAllFields')) return response({}, 404);
      return response({ error: { message: { value: 'Access denied' } } }, 403);
    });

    await expect(probeSharePointFolder({
      ...runtime,
      folderRel: '/sites/schedule/siteDB8/אסור',
      request,
    })).resolves.toMatchObject({
      ready: false,
      exists: false,
      reason: 'FOLDER_PROBE_AUTHORIZATION_FAILED',
      status: 403,
    });
  });

  it('requires the owning list and immediate parent enumeration to agree', async () => {
    const target = '/sites/schedule/siteDB8/parent/child';
    const request = vi.fn(async ({ url }) => {
      if (url.includes("GetByTitle('siteDB8')") && !url.includes('/Items')) {
        return response({ d: { Id: 'lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } });
      }
      if (url.includes('/ListItemAllFields')) {
        return response({ d: { Id: 19, FileSystemObjectType: 1, FileRef: target, FileDirRef: '/sites/schedule/siteDB8/parent' } });
      }
      if (url.includes('/Items')) {
        return response({ d: { results: [{ Id: 19, FileSystemObjectType: 1, FileRef: target, FileDirRef: '/sites/schedule/siteDB8/parent' }] } });
      }
      if (url.includes('/Folders?')) {
        return response({ d: { results: [] } });
      }
      return response({ d: { Exists: true, ServerRelativeUrl: target } });
    });

    await expect(probeSharePointFolder({
      ...runtime,
      folderRel: target,
      request,
    })).resolves.toMatchObject({
      ready: false,
      exists: true,
      reason: 'FOLDER_PARENT_ENUMERATION_MISMATCH',
    });
  });

  it('compares a valid manual child with a visible incomplete historical child without mutations', async () => {
    const ready = '/sites/schedule/siteDB8/אמא';
    const incomplete = '/sites/schedule/siteDB8/אבא';
    const readyPaths = new Set(['/sites/schedule/siteDB8', ready]);
    const request = vi.fn(async ({ url, method }) => {
      const normal = probeResponseFor(url, readyPaths);
      if (normal && !decodeURIComponent(url).includes(incomplete)) return normal;
      if (url.includes("GetByTitle('siteDB8')")) return normal;
      if (url.includes('/ListItemAllFields')) return response({}, 404);
      if (String(method).toUpperCase() === 'GET') {
        return response({ d: { Exists: true, ServerRelativeUrl: incomplete } });
      }
      throw new Error('Diagnostics must remain read-only.');
    });

    await expect(diagnoseSharePointFolders({
      ...runtime,
      folderPaths: [ready, incomplete],
      request,
    })).resolves.toEqual([
      expect.objectContaining({
        requestedPath: ready,
        classification: 'LIST_BACKED_FOLDER_READY',
        ready: true,
        parentEnumerated: true,
      }),
      expect.objectContaining({
        requestedPath: incomplete,
        classification: 'FOLDER_OBJECT_VISIBLE_WAITING_FOR_LIST_ITEM',
        ready: false,
        rawFolderExists: true,
      }),
    ]);
    expect(request.mock.calls.every(([options]) => options.method === 'GET')).toBe(true);
  });
});

describe('SharePoint folder creation and file upload recovery', () => {
  it('creates an L2/L3 folder through the verified list item API', async () => {
    const calls = [];
    const item = {
      update: vi.fn(() => calls.push('update')),
      get_id: () => 41,
    };
    const list = { addItem: vi.fn(() => item) };
    const context = {
      get_web: () => ({
        get_lists: () => ({
          getById: (id) => {
            calls.push(`list:${id}`);
            return list;
          },
        }),
      }),
      load: vi.fn(),
      executeQueryAsync: (success) => success(),
    };
    const creation = {
      set_underlyingObjectType: (value) => calls.push(`type:${value}`),
      set_folderUrl: (value) => calls.push(`parent:${value}`),
      set_leafName: (value) => calls.push(`leaf:${value}`),
    };
    class ClientContext {
      constructor() {
        return context;
      }
    }
    class ListItemCreationInformation {
      constructor() {
        return creation;
      }
    }
    const sp = {
      ClientContext,
      ListItemCreationInformation,
      FileSystemObjectType: { folder: 1 },
    };

    await expect(createSharePointFolderInLibraryViaJsom({
      webUrl: runtime.webUrl,
      libraryId: 'lib-guid',
      parentRel: '/sites/schedule/siteDB8/אב',
      leafName: 'ילד 2026',
      sp,
    })).resolves.toMatchObject({ itemId: 41 });
    expect(calls).toEqual([
      'list:lib-guid',
      'type:1',
      'parent:/sites/schedule/siteDB8/אב',
      'leaf:ילד 2026',
      'update',
    ]);
  });

  it('does not issue a create for visible but incomplete historical folders', async () => {
    const target = '/sites/schedule/siteDB8/historical';
    const request = vi.fn(async ({ url }) => {
      if (url.includes("GetByTitle('siteDB8')")) {
        return response({ d: { Id: 'lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB8' } } });
      }
      if (url.includes('/ListItemAllFields')) return response({}, 404);
      if (url.includes("GetFolderByServerRelativeUrl")) {
        return response({ d: { Exists: true, ServerRelativeUrl: target } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const createFolder = vi.fn();

    await expect(ensureSharePointFolder({
      ...runtime,
      folderRel: target,
      request,
      createFolder,
    })).rejects.toMatchObject({ code: 'FOLDER_RECONCILIATION_REQUIRED' });
    expect(createFolder).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([options]) => options.method === 'POST')).toBe(false);
  });

  it('reuses an existing list-backed folder without issuing a create request', async () => {
    const readyPaths = new Set(['/sites/schedule/siteDB8', '/sites/schedule/siteDB8/existing']);
    const request = vi.fn(async ({ url }) => {
      const probeResponse = probeResponseFor(url, readyPaths);
      if (probeResponse) return probeResponse;
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
    const target = '/sites/schedule/siteDB8/siteAssets';
    const readyPaths = new Set(['/sites/schedule/siteDB8']);
    const request = vi.fn(async ({ url }) => {
      const probeResponse = probeResponseFor(url, readyPaths);
      if (probeResponse) return probeResponse;
      throw new Error(`Unexpected URL ${url}`);
    });
    const createFolder = vi.fn(async () => {
      readyPaths.add(target);
      return { itemId: 12 };
    });

    await expect(ensureSharePointFolder({
      ...runtime,
      folderRel: target,
      request,
      createFolder,
    })).resolves.toMatchObject({ created: true, path: '/sites/schedule/siteDB8/siteAssets' });
  });

    it('recursively readies a missing parent before creating a nested folder', async () => {
      const readyPaths = new Set(['/sites/schedule/siteDB8']);
      const request = vi.fn(async ({ url }) => {
        const probeResponse = probeResponseFor(url, readyPaths);
        if (probeResponse) return probeResponse;
        throw new Error(`Unexpected URL ${url}`);
      });
      const createFolder = vi.fn(async ({ parentRel, leafName }) => {
        readyPaths.add(`${parentRel}/${leafName}`);
      });

      await expect(ensureSharePointFolder({
        ...runtime,
        folderRel: '/sites/schedule/siteDB8/parent/child',
        request,
        createFolder,
      })).resolves.toMatchObject({
        created: true,
        path: '/sites/schedule/siteDB8/parent/child',
        probe: { ready: true },
      });
      const createCalls = createFolder.mock.calls;
      expect(createCalls).toHaveLength(2);
      expect(createCalls[0][0]).toMatchObject({ parentRel: '/sites/schedule/siteDB8', leafName: 'parent' });
      expect(createCalls[1][0]).toMatchObject({ parentRel: '/sites/schedule/siteDB8/parent', leafName: 'child' });
    });

    it('treats a duplicate-create response as idempotent when readiness verification succeeds', async () => {
      const target = '/sites/schedule/siteDB8/duplicate';
      const readyPaths = new Set(['/sites/schedule/siteDB8']);
      const request = vi.fn(async ({ url }) => {
        const probeResponse = probeResponseFor(url, readyPaths);
        if (probeResponse) return probeResponse;
        throw new Error(`Unexpected URL ${url}`);
      });
      const createFolder = vi.fn(async () => {
        readyPaths.add(target);
        throw new SharePointBrowserFilesystemError('SHAREPOINT_JSOM_FOLDER_CREATE_FAILED', 'ambiguous');
      });

      await expect(ensureSharePointFolder({
        ...runtime,
        folderRel: target,
        request,
        createFolder,
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
      const libraries = [{ title: 'תוכן #100%', rootRel: '/sites/schedule/תוכן #100%' }];
      const request = vi.fn(async ({ url }) => {
        const probeResponse = probeResponseFor(
          url,
          new Set(['/sites/schedule/תוכן #100%', folderRel]),
          libraries,
        );
        if (probeResponse) return probeResponse;
        throw new Error(`Unexpected URL ${url}`);
      });

      await expect(probeSharePointFolder({
        webUrl: '/sites/schedule',
        folderRel,
        libraries,
        request,
      })).resolves.toMatchObject({ ready: true, actualPath: folderRel });

      expect(request).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json;odata=verbose' },
        url: expect.stringMatching(/%23.*%25/),
      }));
    });

  it('falls back from server-relative upload to web-relative upload after DirectoryNotFound', async () => {
    const readyPaths = new Set(['/sites/schedule/siteDB8', '/sites/schedule/siteDB8/siteAssets']);
    const fileRel = '/sites/schedule/siteDB8/siteAssets/bihs_master_config_v1.txt';
    const request = vi.fn(async ({ url, method }) => {
      const probeResponse = probeResponseFor(url, readyPaths);
      if (probeResponse) return probeResponse;
      if (method === 'GET' && url.includes('GetFileByServerRelativeUrl')) {
        return response({
          d: {
            Exists: true,
            Name: 'bihs_master_config_v1.txt',
            ServerRelativeUrl: fileRel,
            Length: 3,
            ListItemAllFields: { Id: 29 },
          },
        });
      }
      if (method === 'POST' && url.includes("GetFolderByServerRelativeUrl('/sites/schedule/siteDB8/siteAssets')")) {
        return response({ error: { message: { value: 'System.IO.DirectoryNotFoundException: cannot find part of the path' } } }, 404);
      }
      if (method === 'POST' && url.includes("GetFolderByServerRelativeUrl('siteDB8/siteAssets')")) {
        return response({ d: { Name: 'bihs_master_config_v1.txt', ServerRelativeUrl: fileRel } }, 200);
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
    const fileRel = '/sites/schedule/siteUsersDB8/widgets_data.txt';
    const request = vi.fn(async ({ url, method }) => {
      if (method === 'GET' && url.includes("GetByTitle('siteUsersDB8')")) {
        return response({ d: { Id: 'users-lib', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteUsersDB8' } } });
      }
      if (method === 'GET' && url.includes('GetFileByServerRelativeUrl')) {
        return response({
          d: {
            Exists: true,
            Name: 'widgets_data.txt',
            ServerRelativeUrl: fileRel,
            Length: 3,
            ListItemAllFields: { Id: 30 },
          },
        });
      }
      if (method === 'POST' && url.includes("GetByTitle('siteUsersDB8')/RootFolder/Files/Add")) {
        return response({ d: { Name: 'widgets_data.txt', ServerRelativeUrl: fileRel } }, 200);
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

  it('revalidates the exact parent and retries a DirectoryNotFound upload within a bounded budget', async () => {
    const folderRel = '/sites/schedule/siteDB8/siteAssets';
    const fileRel = `${folderRel}/image.png`;
    const readyPaths = new Set(['/sites/schedule/siteDB8', folderRel]);
    let uploadCalls = 0;
    const request = vi.fn(async ({ url, method, body }) => {
      const probeResponse = probeResponseFor(url, readyPaths);
      if (probeResponse) return probeResponse;
      if (method === 'GET' && url.includes('GetFileByServerRelativeUrl')) {
        return response({
          d: {
            Exists: true,
            ServerRelativeUrl: fileRel,
            Length: body?.byteLength ?? 3,
            ListItemAllFields: { Id: 55 },
          },
        });
      }
      if (method === 'POST' && /\/Files\/Add\(/.test(url)) {
        uploadCalls += 1;
        if (uploadCalls <= 2) {
          return response({
            error: { message: { value: 'System.IO.DirectoryNotFoundException: cannot find part of the path' } },
          }, 404);
        }
        return response({ d: { ServerRelativeUrl: fileRel } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(uploadSharePointFileBytes({
      ...runtime,
      folderRel,
      fileName: 'image.png',
      bytes: new Uint8Array([1, 2, 3]),
      request,
    })).resolves.toMatchObject({ cycle: 2, fileRel });
    expect(uploadCalls).toBe(3);
    expect(request.mock.calls.filter(([options]) => options.url.includes('/ListItemAllFields')).length).toBeGreaterThan(1);
  });

  it('refreshes a digest only for an explicit security-validation failure', async () => {
    const folderRel = '/sites/schedule/siteDB8/siteAssets';
    const fileRel = `${folderRel}/image.png`;
    const readyPaths = new Set(['/sites/schedule/siteDB8', folderRel]);
    const refreshDigest = vi.fn().mockResolvedValue('fresh-digest');
    let uploadCalls = 0;
    const request = vi.fn(async ({ url, method, headers }) => {
      const probeResponse = probeResponseFor(url, readyPaths);
      if (probeResponse) return probeResponse;
      if (method === 'GET' && url.includes('GetFileByServerRelativeUrl')) {
        return response({
          d: {
            Exists: true,
            ServerRelativeUrl: fileRel,
            Length: 3,
            ListItemAllFields: { Id: 56 },
          },
        });
      }
      if (method === 'POST' && /\/Files\/Add\(/.test(url)) {
        uploadCalls += 1;
        if (uploadCalls === 1) {
          return response({
            error: { message: { value: 'The security validation for this page is invalid. Request digest expired.' } },
          }, 403);
        }
        expect(headers['X-RequestDigest']).toBe('fresh-digest');
        return response({ d: { ServerRelativeUrl: fileRel } });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(uploadSharePointFileBytes({
      ...runtime,
      folderRel,
      fileName: 'image.png',
      bytes: new Uint8Array([1, 2, 3]),
      request,
      refreshDigest,
    })).resolves.toMatchObject({ fileRel });
    expect(refreshDigest).toHaveBeenCalledOnce();
  });

  it('never retries an ordinary permission failure as eventual consistency', async () => {
    const folderRel = '/sites/schedule/siteDB8/siteAssets';
    const readyPaths = new Set(['/sites/schedule/siteDB8', folderRel]);
    let uploadCalls = 0;
    const request = vi.fn(async ({ url, method }) => {
      const probeResponse = probeResponseFor(url, readyPaths);
      if (probeResponse) return probeResponse;
      if (method === 'POST' && /\/Files\/Add\(/.test(url)) {
        uploadCalls += 1;
        return response({ error: { message: { value: 'Access denied.' } } }, 403);
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(uploadSharePointFileBytes({
      ...runtime,
      folderRel,
      fileName: 'image.png',
      bytes: new Uint8Array([1, 2, 3]),
      request,
      refreshDigest: vi.fn(),
    })).rejects.toMatchObject({
      code: 'FILE_UPLOAD_FAILED',
      details: { status: 403 },
    });
    expect(uploadCalls).toBe(1);
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

  it('treats old SharePoint HTTP 400 FileNotFoundException as an absent file', async () => {
    expect(isSharePointFileMissingResponse({
      status: 400,
      payload: { error: { message: { value: 'System.IO.FileNotFoundException: The file does not exist.' } } },
    })).toBe(true);

    const request = vi.fn(async () => response(
      { error: { message: { value: 'System.IO.FileNotFoundException: The file does not exist.' } } },
      400,
    ));
    await expect(readSharePointFileBytes({
      webUrl: runtime.webUrl,
      siteRoot: runtime.siteRoot,
      fileRel: '/sites/schedule/siteDB8/dist/index.html',
      request,
    })).resolves.toMatchObject({ exists: false, status: 404 });
  });

  it('does not hide unrelated HTTP 400 file-read failures', async () => {
    const request = vi.fn(async () => response(
      { error: { message: { value: 'Invalid query syntax.' } } },
      400,
    ));
    await expect(readSharePointFileBytes({
      webUrl: runtime.webUrl,
      siteRoot: runtime.siteRoot,
      fileRel: '/sites/schedule/siteDB8/dist/index.html',
      request,
    })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' });
  });

  it('uses ListItemAllFields as the primary readiness probe', async () => {
    const request = vi.fn(async ({ url }) => {
      const probeResponse = probeResponseFor(
        url,
        new Set(['/sites/schedule/siteDB8', '/sites/schedule/siteDB8/siteAssets']),
      );
      if (probeResponse) return probeResponse;
      throw new Error(`Unexpected URL ${url}`);
    });
    await probeSharePointFolder({
      webUrl: runtime.webUrl,
      folderRel: '/sites/schedule/siteDB8/siteAssets',
      libraries: runtime.libraries,
      request,
    });
    expect(request.mock.calls.some(([options]) => options.url.includes('/ListItemAllFields'))).toBe(true);
  });
});
