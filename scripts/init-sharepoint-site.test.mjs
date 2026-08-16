import { describe, expect, it } from 'vitest';
import { checkLibraryReadiness } from './init-sharepoint-site.js';

const response = (body, status = 200) => ({
  status,
  headers: { get: () => 'application/json;odata=minimalmetadata' },
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
});

describe('Legacy REST library readiness check', () => {
  it('classifies /sites/schedule configured document libraries as ready without Forms/AllItems.aspx', async () => {
    const result = await checkLibraryReadiness({
      title: 'siteDB',
      rel: '/sites/schedule/siteDB',
      host: 'portal.army.idf',
      siteApiRootRel: '/sites/schedule',
      fetchImpl: async (endpoint) => {
        expect(endpoint).toContain('/sites/schedule/_api/web/lists/GetByTitle');
        return response({ Title: 'siteDB', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB' } });
      },
    });
    expect(result).toMatchObject({ exists: true, isDocumentLibrary: true, ready: true, reason: 'LIBRARY_READY' });
  });

  it('reports a malformed successful response as unrecognized instead of missing', async () => {
    const result = await checkLibraryReadiness({
      title: 'siteDB',
      rel: '/sites/schedule/siteDB',
      host: 'portal.army.idf',
      siteApiRootRel: '/sites/schedule',
      fetchImpl: async () => response('<feed />'),
    });
    expect(result).toMatchObject({ exists: true, ready: false, reason: 'LIBRARY_RESPONSE_UNRECOGNIZED' });
  });
});
