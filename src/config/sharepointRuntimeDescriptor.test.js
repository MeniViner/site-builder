import { describe, expect, it } from 'vitest';
import { createSharePointRuntimeDescriptor } from './sharepointRuntimeDescriptor';

describe('createSharePointRuntimeDescriptor', () => {
  it('derives every TXT path for a portal target', () => {
    const descriptor = createSharePointRuntimeDescriptor({
      host: 'portal.army.idf',
      siteCode: 'site-a',
      siteDbFolder: 'siteDB',
      usersDbFolder: 'siteUsersDb',
      siteAssetsFolder: 'siteAssets',
      imagesFolder: 'images',
      widgetsDbTarget: 'users',
    });

    expect(descriptor).toMatchObject({
      siteRoot: '/sites/site-a',
      siteApiRoot: '/sites/site-a',
      siteDbRoot: '/sites/site-a/siteDB',
      usersDbRoot: '/sites/site-a/siteUsersDb',
      siteAssetsRoot: '/sites/site-a/siteDB/siteAssets',
      imagesRoot: '/sites/site-a/siteDB/images',
      widgetsFileServerRelativeUrl: '/sites/site-a/siteUsersDb/widgets_data.txt',
      finalAppUrl: 'https://portal.army.idf/sites/site-a/siteDB/dist/index.html',
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it('resolves an independent mazi target without sharing state', () => {
    const descriptor = createSharePointRuntimeDescriptor({
      host: 'mazi.army.idf',
      siteCode: 'site-b',
      widgetsDbTarget: 'site',
    });

    expect(descriptor).toMatchObject({
      siteRoot: '/sites/site-b',
      sharePointSiteUrl: 'https://mazi.army.idf/sites/site-b',
      widgetsFileServerRelativeUrl: '/sites/site-b/siteDB/siteAssets/widgets_data.txt',
      finalAppUrl: 'https://mazi.army.idf/sites/site-b/siteDB/dist/index.html',
    });
  });

  it('rejects inconsistent redundant paths rather than guessing a destination', () => {
    expect(() => createSharePointRuntimeDescriptor({
      host: 'portal.army.idf',
      siteCode: 'site-a',
      siteDbRoot: '/sites/other/siteDB',
    })).toThrow('does not match the canonical runtime path');
  });
});
