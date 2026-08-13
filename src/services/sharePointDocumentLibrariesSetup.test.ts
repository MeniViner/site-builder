import { describe, expect, it } from 'vitest';
import { unwrapSharePointODataRecord } from './sharePointDocumentLibrariesSetup';

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

  it('does not reinterpret Atom/XML or other non-object payloads as a valid library', () => {
    expect(unwrapSharePointODataRecord('<feed>...</feed>')).toBeNull();
    expect(unwrapSharePointODataRecord(null)).toBeNull();
  });
});
