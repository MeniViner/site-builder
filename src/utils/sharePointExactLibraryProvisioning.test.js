import { describe, expect, it, vi } from 'vitest';
import {
  EXACT_LIBRARY_ERRORS,
  EXACT_LIBRARY_OUTCOMES,
  classifyExactLibraryState,
  createDocumentLibraryWithExactUrl,
  deriveSiteRelativeListUrl,
  ensureExactSharePointLibrary,
  unwrapSharePointODataCollection,
} from './sharePointExactLibraryProvisioning';

const library = ({
  id = 'list-1',
  title = 'siteDB',
  root = '/sites/schedule/siteDB',
  baseTemplate = 101,
} = {}) => ({
  Id: id,
  Title: title,
  BaseTemplate: baseTemplate,
  RootFolder: { ServerRelativeUrl: root },
});

const ensure = (overrides = {}) => ensureExactSharePointLibrary({
  siteRoot: '/sites/schedule',
  configuredTitle: 'siteDB',
  expectedRoot: '/sites/schedule/siteDB',
  readByTitle: async () => null,
  readAllLibraries: async () => [],
  createWithExactUrl: async () => library(),
  ...overrides,
});

describe('exact SharePoint library collision classification', () => {
  it('reuses a title whose document-library root exactly matches configuration', () => {
    expect(classifyExactLibraryState({
      configuredTitle: 'siteDB',
      expectedRoot: '/sites/schedule/siteDB',
      titleRecord: library(),
      rootRecord: library(),
    })).toMatchObject({ outcome: EXACT_LIBRARY_OUTCOMES.REUSE });
  });

  it('reports LIBRARY_URL_COLLISION when the configured title resolves to an alternate root', () => {
    expect(() => classifyExactLibraryState({
      configuredTitle: 'siteDB1158',
      expectedRoot: '/sites/schedule/siteDB1158',
      titleRecord: library({ title: 'siteDB1158', root: '/sites/schedule/siteDB11581' }),
    })).toThrowError(expect.objectContaining({
      code: EXACT_LIBRARY_ERRORS.COLLISION,
      configuredTitle: 'siteDB1158',
      expectedRoot: '/sites/schedule/siteDB1158',
      actualRoot: '/sites/schedule/siteDB11581',
      actualListId: 'list-1',
      baseTemplate: 101,
    }));
  });

  it('reports LIBRARY_URL_COLLISION when the expected root belongs to another title', () => {
    expect(() => classifyExactLibraryState({
      configuredTitle: 'siteDBFresh1608',
      expectedRoot: '/sites/schedule/siteDBFresh1608',
      titleRecord: null,
      rootRecord: library({ title: 'OtherRecords', root: '/sites/schedule/siteDBFresh1608' }),
    })).toThrowError(expect.objectContaining({
      code: EXACT_LIBRARY_ERRORS.COLLISION,
      actualTitle: 'OtherRecords',
      actualRoot: '/sites/schedule/siteDBFresh1608',
    }));
  });

  it('rejects an exact-root object whose BaseTemplate is not 101', () => {
    expect(() => classifyExactLibraryState({
      configuredTitle: 'siteDB',
      expectedRoot: '/sites/schedule/siteDB',
      titleRecord: library({ baseTemplate: 100 }),
    })).toThrowError(expect.objectContaining({ code: EXACT_LIBRARY_ERRORS.NOT_DOCUMENT_LIBRARY, baseTemplate: 100 }));
  });
});

describe('deterministic exact SharePoint library creation', () => {
  it('creates only when neither title nor configured root exists and passes the exact site-relative URL', async () => {
    const createWithExactUrl = vi.fn().mockResolvedValue(library({ title: 'siteDBFresh1608', root: '/sites/schedule/siteDBFresh1608' }));
    const result = await ensure({
      configuredTitle: 'siteDBFresh1608',
      expectedRoot: '/sites/schedule/siteDBFresh1608',
      createWithExactUrl,
    });
    expect(createWithExactUrl).toHaveBeenCalledWith({
      title: 'siteDBFresh1608',
      siteRelativeUrl: 'siteDBFresh1608',
      expectedRoot: '/sites/schedule/siteDBFresh1608',
    });
    expect(result).toMatchObject({ outcome: EXACT_LIBRARY_OUTCOMES.CREATED, created: true, siteRelativeUrl: 'siteDBFresh1608' });
  });

  it('accepts the returned list ID only when its title, template, and root are exact', async () => {
    await expect(ensure({ createWithExactUrl: async () => library({ id: 'created-guid' }) })).resolves.toMatchObject({
      created: true,
      record: { Id: 'created-guid', BaseTemplate: 101, RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDB' } },
    });
  });

  it('reports LIBRARY_URL_ALLOCATION_FAILED when SharePoint auto-suffixes the requested root', async () => {
    await expect(ensure({
      configuredTitle: 'siteDB1158',
      expectedRoot: '/sites/schedule/siteDB1158',
      createWithExactUrl: async () => library({ title: 'siteDB1158', root: '/sites/schedule/siteDB11581' }),
    })).rejects.toMatchObject({
      code: EXACT_LIBRARY_ERRORS.ALLOCATION_FAILED,
      expectedRoot: '/sites/schedule/siteDB1158',
      actualRoot: '/sites/schedule/siteDB11581',
    });
  });

  it('reports LIBRARY_URL_ALLOCATION_FAILED when SharePoint refuses the explicit URL', async () => {
    await expect(ensure({
      createWithExactUrl: async () => { throw new Error('The specified name is already in use.'); },
    })).rejects.toMatchObject({
      code: EXACT_LIBRARY_ERRORS.ALLOCATION_FAILED,
      configuredTitle: 'siteDB',
      expectedRoot: '/sites/schedule/siteDB',
      actualRoot: '',
      cause: expect.objectContaining({ message: 'The specified name is already in use.' }),
    });
  });

  it('creates only the missing library when the other configured library is already exact', async () => {
    const createWithExactUrl = vi.fn(async ({ title, expectedRoot }) => library({ id: `${title}-id`, title, root: expectedRoot }));
    const exactSiteDb = library();
    const siteDb = await ensure({
      readByTitle: async () => exactSiteDb,
      readAllLibraries: async () => [exactSiteDb],
      createWithExactUrl,
    });
    const usersDb = await ensure({
      configuredTitle: 'siteUsersDB',
      expectedRoot: '/sites/schedule/siteUsersDB',
      createWithExactUrl,
    });
    expect(siteDb.outcome).toBe(EXACT_LIBRARY_OUTCOMES.REUSE);
    expect(usersDb.outcome).toBe(EXACT_LIBRARY_OUTCOMES.CREATED);
    expect(createWithExactUrl).toHaveBeenCalledTimes(1);
  });

  it('reuses both exact configured libraries without creating duplicates', async () => {
    const createWithExactUrl = vi.fn();
    const records = [
      library(),
      library({ id: 'users-id', title: 'siteUsersDB', root: '/sites/schedule/siteUsersDB' }),
    ];
    const siteDb = await ensure({
      readByTitle: async () => records[0],
      readAllLibraries: async () => records,
      createWithExactUrl,
    });
    const usersDb = await ensure({
      configuredTitle: 'siteUsersDB',
      expectedRoot: '/sites/schedule/siteUsersDB',
      readByTitle: async () => records[1],
      readAllLibraries: async () => records,
      createWithExactUrl,
    });
    expect([siteDb.outcome, usersDb.outcome]).toEqual([
      EXACT_LIBRARY_OUTCOMES.REUSE,
      EXACT_LIBRARY_OUTCOMES.REUSE,
    ]);
    expect(createWithExactUrl).not.toHaveBeenCalled();
  });

  it('is idempotent after successful creation and does not create a duplicate on retry', async () => {
    const records = [];
    const createWithExactUrl = vi.fn(async ({ title, expectedRoot }) => {
      const created = library({ id: 'stable-id', title, root: expectedRoot });
      records.push(created);
      return created;
    });
    const options = {
      readByTitle: async (title) => records.find((record) => record.Title === title) || null,
      readAllLibraries: async () => records,
      createWithExactUrl,
    };
    await ensure(options);
    const retry = await ensure(options);
    expect(retry.outcome).toBe(EXACT_LIBRARY_OUTCOMES.REUSE);
    expect(createWithExactUrl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/sites/schedule', '/sites/schedule/siteDB', 'siteDB'],
    ['/sites/schedule', '/sites/schedule/siteUsersDB', 'siteUsersDB'],
    ['/sites/schedule', '/sites/schedule/siteDBFresh1608', 'siteDBFresh1608'],
    ['/sites/EnergyEfficiency', '/sites/EnergyEfficiency/bdikaUsersDB', 'bdikaUsersDB'],
  ])('derives configured site-relative URL %s + %s', (siteRoot, expectedRoot, expected) => {
    expect(deriveSiteRelativeListUrl(siteRoot, expectedRoot)).toBe(expected);
  });

  it('normalizes verbose and value-wrapped list collections for root collision checks', () => {
    const first = library();
    const second = library({ id: 'list-2', title: 'siteUsersDB', root: '/sites/schedule/siteUsersDB' });
    expect(unwrapSharePointODataCollection({ d: { results: [first, second] } })).toHaveLength(2);
    expect(unwrapSharePointODataCollection({ value: [first] })[0]).toMatchObject({ Id: 'list-1', Title: 'siteDB' });
  });

  it('uses SP.ListCreationInformation.set_url and returns the created list object metadata', async () => {
    const captured = {};
    const rootFolder = {
      get_serverRelativeUrl: () => '/sites/schedule/siteDBFresh1608',
      get_welcomePage: () => '',
    };
    const createdList = {
      set_description: vi.fn(),
      set_onQuickLaunch: vi.fn(),
      update: vi.fn(),
      get_rootFolder: () => rootFolder,
      get_id: () => ({ toString: () => 'created-guid' }),
      get_title: () => 'siteDBFresh1608',
      get_baseTemplate: () => 101,
      get_defaultViewUrl: vi.fn(() => { throw new Error("The property or field 'DefaultViewUrl' has not been initialized."); }),
      get_onQuickLaunch: () => true,
    };
    class ListCreationInformation {
      set_title(value) { captured.title = value; }
      set_templateType(value) { captured.templateType = value; }
      set_url(value) { captured.url = value; }
    }
    class ClientContext {
      get_web() { return { get_lists: () => ({ add: (info) => { captured.info = info; return createdList; } }) }; }
      load(value, ...properties) { captured.loaded = [...(captured.loaded || []), [value, properties]]; }
      executeQueryAsync(success) { success(); }
    }
    const result = await createDocumentLibraryWithExactUrl({
      webUrl: 'https://portal.army.idf/sites/schedule',
      title: 'siteDBFresh1608',
      siteRelativeUrl: 'siteDBFresh1608',
      sp: { ClientContext, ListCreationInformation },
    });
    expect(captured).toMatchObject({ title: 'siteDBFresh1608', templateType: 101, url: 'siteDBFresh1608' });
    expect(captured.loaded).toEqual([
      [createdList, ['Id', 'Title', 'BaseTemplate', 'OnQuickLaunch']],
      [rootFolder, ['ServerRelativeUrl', 'WelcomePage']],
    ]);
    expect(createdList.get_defaultViewUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      Id: 'created-guid',
      Title: 'siteDBFresh1608',
      BaseTemplate: 101,
      RootFolder: { ServerRelativeUrl: '/sites/schedule/siteDBFresh1608' },
    });
  });

  it('normalizes executeQueryAsync failure as a JSOM query failure', async () => {
    class ListCreationInformation {
      set_title() {}
      set_templateType() {}
      set_url() {}
    }
    class ClientContext {
      get_web() {
        return {
          get_lists: () => ({
            add: () => ({
              get_rootFolder: () => ({}),
              update() {},
            }),
          }),
        };
      }
      load() {}
      executeQueryAsync(_success, failure) {
        failure(null, { get_message: () => 'Access denied by SharePoint' });
      }
    }
    await expect(createDocumentLibraryWithExactUrl({
      webUrl: 'https://portal.army.idf/sites/schedule',
      title: 'siteDBFresh1608',
      siteRelativeUrl: 'siteDBFresh1608',
      sp: { ClientContext, ListCreationInformation },
    })).rejects.toEqual(expect.objectContaining({
      code: EXACT_LIBRARY_ERRORS.JSOM_QUERY_FAILED,
      operation: 'create-library',
      target: 'siteDBFresh1608',
    }));
  });

  it('normalizes a synchronous post-query ClientObject property error', async () => {
    const propertyError = new Error("The property or field 'ServerRelativeUrl' has not been initialized.");
    const rootFolder = {
      get_serverRelativeUrl: () => { throw propertyError; },
      get_welcomePage: () => '',
    };
    const createdList = {
      get_rootFolder: () => rootFolder,
      get_id: () => 'id',
      get_title: () => 'siteDB',
      get_baseTemplate: () => 101,
      get_onQuickLaunch: () => true,
      update() {},
    };
    class ListCreationInformation {
      set_title() {}
      set_templateType() {}
      set_url() {}
    }
    class ClientContext {
      get_web() { return { get_lists: () => ({ add: () => createdList }) }; }
      load() {}
      executeQueryAsync(success) { success(); }
    }
    await expect(createDocumentLibraryWithExactUrl({
      webUrl: 'https://portal.army.idf/sites/schedule',
      title: 'siteDB',
      siteRelativeUrl: 'siteDB',
      sp: { ClientContext, ListCreationInformation },
    })).rejects.toEqual(expect.objectContaining({
      code: EXACT_LIBRARY_ERRORS.JSOM_PROPERTY_NOT_LOADED,
      operation: 'verify-created-library',
      property: 'ServerRelativeUrl',
    }));
  });
});
