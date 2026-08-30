import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureSharePointDocumentLibrariesReady,
  provisionSharePointDocumentLibrary,
  unwrapSharePointODataRecord,
} from './sharePointDocumentLibrariesSetup';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('general document-library provisioning', () => {
  const siteRoot = '/sites/custom';
  const title = 'תכניות עבודה';
  const rootServerRelativeUrl = '/sites/custom/content-library-123';

  const createLibraryRecord = ({ welcomePage = 'Forms/AllItems.aspx', onQuickLaunch = true } = {}) => ({
    Id: 'library-guid',
    Title: title,
    BaseTemplate: 101,
    RootFolder: {
      ServerRelativeUrl: rootServerRelativeUrl,
      WelcomePage: welcomePage,
    },
    OnQuickLaunch: onQuickLaunch,
  });

  const session = {
    siteRoot,
    digest: 'digest',
    logs: [],
    request: vi.fn(),
  };

  it('reuses an exact library and returns its verified List ID, root, template, and browser view', async () => {
    const record = createLibraryRecord();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/_api/web/lists?')) {
        return new Response(JSON.stringify({ d: { results: [record] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ d: record }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    await expect(provisionSharePointDocumentLibrary({
      session,
      title,
      rootServerRelativeUrl,
    })).resolves.toMatchObject({
      listId: 'library-guid',
      title,
      baseTemplate: 101,
      rootServerRelativeUrl,
      welcomePage: 'Forms/AllItems.aspx',
      onQuickLaunch: true,
      wasCreated: false,
    });
  });

  it('sets and rereads OnQuickLaunch and Forms/AllItems.aspx before reporting success', async () => {
    let welcomePage = '';
    let onQuickLaunch = false;
    const fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
      const method = String(options.method || 'GET').toUpperCase();
      if (method === 'POST' && url.includes('GetByTitle')) {
        onQuickLaunch = true;
        return new Response(null, { status: 204 });
      }
      if (method === 'POST' && url.includes('GetFolderByServerRelativeUrl')) {
        welcomePage = 'Forms/AllItems.aspx';
        return new Response(null, { status: 204 });
      }
      const record = createLibraryRecord({ welcomePage, onQuickLaunch });
      if (url.includes('/_api/web/lists?')) {
        return new Response(JSON.stringify({ d: { results: [record] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ d: record }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await provisionSharePointDocumentLibrary({ session, title, rootServerRelativeUrl });

    expect(result).toMatchObject({
      welcomePage: 'Forms/AllItems.aspx',
      onQuickLaunch: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("GetFolderByServerRelativeUrl"),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Forms/AllItems.aspx'),
      }),
    );
  });

  it('rejects navigation provisioning when SharePoint does not retain OnQuickLaunch', async () => {
    const record = createLibraryRecord({ onQuickLaunch: false });
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
      if (String(options.method || 'GET').toUpperCase() === 'POST') {
        return new Response(null, { status: 204 });
      }
      if (url.includes('/_api/web/lists?')) {
        return new Response(JSON.stringify({ d: { results: [record] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ d: record }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    await expect(provisionSharePointDocumentLibrary({
      session,
      title,
      rootServerRelativeUrl,
    })).rejects.toThrow('did not retain OnQuickLaunch=true');
  });

  it('encodes URL-significant characters in library-title REST lookups', async () => {
    const specialTitle = 'תוכן #100%?';
    const specialRoot = '/sites/custom/content-special';
    const record = {
      ...createLibraryRecord(),
      Title: specialTitle,
      RootFolder: {
        ServerRelativeUrl: specialRoot,
        WelcomePage: 'Forms/AllItems.aspx',
      },
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/_api/web/lists?')) {
        return new Response(JSON.stringify({ d: { results: [record] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ d: record }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await provisionSharePointDocumentLibrary({
      session,
      title: specialTitle,
      rootServerRelativeUrl: specialRoot,
    });

    const titleLookup = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('GetByTitle'));
    expect(titleLookup).toContain('%23');
    expect(titleLookup).toContain('%25');
    expect(titleLookup).toContain('%3F');
    expect(titleLookup).not.toContain(specialTitle);
  });
});

describe('SharePoint document-library response parsing', () => {
  const library = {
    Id: 'library-id',
    Title: 'RecordsDb',
    BaseTemplate: 101,
    DefaultViewUrl: '/sites/custom/RecordsDb/Forms/AllItems.aspx',
    RootFolder: { ServerRelativeUrl: '/sites/custom/RecordsDb', WelcomePage: 'Forms/AllItems.aspx' },
    OnQuickLaunch: true,
  };

  it('reads the classic SharePoint verbose JSON wrapper', () => {
    expect(unwrapSharePointODataRecord({ d: library })).toEqual(library);
  });

  it('reads minimal/no-metadata SharePoint JSON instead of treating an existing library as missing', () => {
    expect(unwrapSharePointODataRecord(library)).toEqual(library);
    expect(unwrapSharePointODataRecord({ value: library })).toEqual(library);
  });

  it('does not require DefaultViewUrl when normalizing authoritative library identity', () => {
    const { DefaultViewUrl: _ignored, ...withoutDefaultViewUrl } = library;
    expect(unwrapSharePointODataRecord({ d: withoutDefaultViewUrl })).toMatchObject({
      Id: 'library-id',
      Title: 'RecordsDb',
      BaseTemplate: 101,
      RootFolder: { ServerRelativeUrl: '/sites/custom/RecordsDb' },
    });
  });

  it('does not reinterpret Atom/XML or other non-object payloads as a valid library', () => {
    expect(unwrapSharePointODataRecord('<feed>...</feed>')).toBeNull();
    expect(unwrapSharePointODataRecord(null)).toBeNull();
  });

  it('reports browser REST 401 as SHAREPOINT_AUTH_FAILURE rather than a missing library', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureSharePointDocumentLibrariesReady();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/_api/'), expect.objectContaining({ credentials: 'include' }));
    expect(result).toMatchObject({
      ok: false,
      status: 'sharepoint-auth-failure',
      technicalError: expect.objectContaining({ code: 'SHAREPOINT_AUTH_FAILURE', status: 401 }),
    });
    expect(result.userMessage).toContain('SHAREPOINT_AUTH_FAILURE');
  });
});
