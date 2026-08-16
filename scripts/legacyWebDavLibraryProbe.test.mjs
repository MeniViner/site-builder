import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  decideLegacyLibraryDeployment,
  LEGACY_WEBDAV_LIBRARY_STATUS,
  probeLegacyWebDavLibrary,
} from './legacyWebDavLibraryProbe.mjs';
import { createLegacyDeploymentPlan } from './legacyPipelinePlan.mjs';

const toWebDav = (rel) => path.win32.join('\\\\portal.army.idf@SSL\\DavWWWRoot', ...rel.split('/').filter(Boolean));
const completed = () => '';
const failed = (status, stdout) => { throw Object.assign(new Error('robocopy probe failed'), { status, stdout }); };

const probe = ({ libraryRel, execute }) => probeLegacyWebDavLibrary({
  title: libraryRel.split('/').pop(),
  libraryRel,
  siteRootRel: libraryRel.split('/').slice(0, 3).join('/'),
  toWebDav,
  probeDestination: 'C:\\Temp\\sitebuilder-probe',
  execute,
});

describe('Legacy Node WebDAV library probes', () => {
  it.each([
    '/sites/schedule/siteDB',
    '/sites/schedule/siteUsersDB',
  ])('reports existing configured root %s as EXISTS', (libraryRel) => {
    expect(probe({ libraryRel, execute: completed })).toMatchObject({
      rel: libraryRel,
      status: LEGACY_WEBDAV_LIBRARY_STATUS.EXISTS,
      exists: true,
    });
  });

  it('reports a missing library as MISSING only after the parent site root probes successfully', () => {
    let call = 0;
    const result = probe({
      libraryRel: '/sites/EnergyEfficiency/freshTest01',
      execute() {
        call += 1;
        if (call === 1) return failed(16, 'ERROR 3 The system cannot find the path specified.');
        return completed();
      },
    });
    expect(result).toMatchObject({ status: LEGACY_WEBDAV_LIBRARY_STATUS.MISSING, exists: false });
    expect(call).toBe(2);
  });

  it('reports authentication/network failures as TRANSPORT_ERROR instead of MISSING', () => {
    const result = probe({
      libraryRel: '/sites/schedule/siteDB',
      execute: () => failed(16, 'ERROR 53 The network path was not found.'),
    });
    expect(result).toMatchObject({ status: LEGACY_WEBDAV_LIBRARY_STATUS.TRANSPORT_ERROR });
  });

  it('treats Robocopy success and informational exit codes as a reachable library', () => {
    expect(probe({
      libraryRel: '/sites/schedule/siteDB',
      execute: () => failed(1, 'New File'),
    })).toMatchObject({
      status: LEGACY_WEBDAV_LIBRARY_STATUS.EXISTS,
      exists: true,
      libraryProbe: { exitCode: 1 },
    });
  });

  it('never calls SharePoint REST while making the Legacy Node deployment decision', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    probe({ libraryRel: '/sites/schedule/siteDB', execute: completed });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('Legacy WebDAV FINAL/BOOTSTRAP decisions', () => {
  const exists = (title) => ({ title, status: LEGACY_WEBDAV_LIBRARY_STATUS.EXISTS });
  const missing = (title) => ({ title, status: LEGACY_WEBDAV_LIBRARY_STATUS.MISSING });
  const config = (siteCode, siteDbFolder = 'siteDB') => ({
    host: 'portal.army.idf',
    siteCode,
    distRel: `/sites/${siteCode}/${siteDbFolder}/dist`,
    bootstrapDistRel: `/sites/${siteCode}/SiteAssets/sitebuilder-bootstrap/dist`,
    toWebDav,
  });

  it.each([
    ['schedule', exists('siteDB'), exists('siteUsersDB')],
    ['EnergyEfficiency', exists('siteDB'), exists('siteUsersDB')],
  ])('%s existing libraries choose FINAL', (siteCode, siteDb, usersDb) => {
    const decision = decideLegacyLibraryDeployment(siteDb, usersDb);
    expect(decision).toMatchObject({ librariesReady: true, deployMode: 'final' });
    expect(createLegacyDeploymentPlan(config(siteCode), decision.librariesReady).deployMode).toBe('final');
  });

  it('fresh logical libraries under EnergyEfficiency choose BOOTSTRAP', () => {
    const decision = decideLegacyLibraryDeployment(missing('freshTest01'), missing('freshTest01UsersDB'));
    expect(decision).toMatchObject({ librariesReady: false, deployMode: 'bootstrap' });
    expect(createLegacyDeploymentPlan(config('EnergyEfficiency', 'freshTest01'), decision.librariesReady).deployMode).toBe('bootstrap');
  });

  it('refuses to guess FINAL or BOOTSTRAP when either probe has a transport error', () => {
    const transportError = {
      title: 'siteUsersDB',
      status: LEGACY_WEBDAV_LIBRARY_STATUS.TRANSPORT_ERROR,
    };
    expect(decideLegacyLibraryDeployment(exists('siteDB'), transportError)).toMatchObject({
      librariesReady: false,
      deployMode: 'none',
      transportError,
    });
  });
});
