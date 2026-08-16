import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureSharePointDocumentLibrariesReady,
  unwrapSharePointODataRecord,
} from './sharePointDocumentLibrariesSetup';

afterEach(() => {
  vi.unstubAllGlobals();
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
