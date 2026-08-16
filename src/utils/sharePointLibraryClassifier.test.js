import { describe, expect, it } from 'vitest';
import { classifySharePointLibraryResponse } from './sharePointLibraryClassifier';

const expectedRoot = '/sites/schedule/siteDB';
const library = {
  Title: 'siteDB',
  BaseTemplate: 101,
  RootFolder: { ServerRelativeUrl: expectedRoot },
};

describe('SharePoint library readiness classifier', () => {
  it.each([
    ['verbose OData', { d: library }],
    ['minimal/direct JSON', library],
    ['value-wrapped JSON', { value: library }],
  ])('classifies %s document-library metadata as ready', (_label, payload) => {
    expect(classifySharePointLibraryResponse({ status: 200, payload, title: 'siteDB', expectedRootUrl: expectedRoot }))
      .toMatchObject({ exists: true, isDocumentLibrary: true, ready: true, reason: 'LIBRARY_READY', baseTemplate: 101, rootFolder: expectedRoot });
  });

  it('accepts casing differences and does not require Forms/AllItems.aspx or a view URL', () => {
    expect(classifySharePointLibraryResponse({
      status: 200,
      payload: { title: 'SITEDB', basetemplate: '101', rootfolder: { serverrelativeurl: '/SITES/SCHEDULE/sitedb' } },
      title: 'siteDB',
      expectedRootUrl: expectedRoot,
    })).toMatchObject({ ready: true, reason: 'LIBRARY_READY' });
  });

  it('locks the schedule regression: two existing configured libraries are ready without Forms/AllItems.aspx', () => {
    const siteDb = classifySharePointLibraryResponse({ status: 200, payload: library, title: 'siteDB', expectedRootUrl: '/sites/schedule/siteDB' });
    const usersDb = classifySharePointLibraryResponse({
      status: 200,
      payload: { Title: 'siteUsersDB', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteUsersDB' } },
      title: 'siteUsersDB',
      expectedRootUrl: '/sites/schedule/siteUsersDB',
    });
    expect(siteDb.ready && usersDb.ready).toBe(true);
  });

  it('distinguishes a missing library from an existing non-document list', () => {
    expect(classifySharePointLibraryResponse({ status: 404, title: 'missing', expectedRootUrl: '/sites/schedule/missing' }))
      .toMatchObject({ exists: false, ready: false, reason: 'LIBRARY_NOT_FOUND' });
    expect(classifySharePointLibraryResponse({
      status: 200,
      payload: { Title: 'siteDB', BaseTemplate: 100, RootFolder: { ServerRelativeUrl: expectedRoot } },
      title: 'siteDB',
      expectedRootUrl: expectedRoot,
    })).toMatchObject({ exists: true, ready: false, reason: 'LIBRARY_EXISTS_NOT_DOCUMENT_LIBRARY' });
  });

  it('reports malformed metadata as unrecognized rather than missing', () => {
    expect(classifySharePointLibraryResponse({
      status: 200,
      payload: { d: '<atom:feed />' },
      title: 'siteDB',
      expectedRootUrl: expectedRoot,
      parsedAs: 'xml',
    })).toMatchObject({ exists: true, ready: false, reason: 'LIBRARY_RESPONSE_UNRECOGNIZED' });
  });

  it.each([401, 403])('reports browser HTTP %i as SHAREPOINT_AUTH_FAILURE', (status) => {
    expect(classifySharePointLibraryResponse({ status, payload: { error: 'unauthorized' } }))
      .toMatchObject({ ready: false, reason: 'SHAREPOINT_AUTH_FAILURE', responseType: 'auth-failure' });
  });
});
