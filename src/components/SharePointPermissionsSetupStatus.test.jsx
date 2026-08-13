// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { isAdmin: true, loading: false },
  paths: {
    host: 'localhost',
    siteRoot: '/sites/EnergyEfficiency',
    siteDbFolder: 'siteDB',
    siteDbRoot: '/sites/EnergyEfficiency/siteDB',
    targetDistPath: '/sites/EnergyEfficiency/siteDB/dist',
    bootstrapLibrary: 'SiteAssets',
    bootstrapFolder: 'sitebuilder-bootstrap',
  },
  ensureLibraries: vi.fn(),
  ensurePermissions: vi.fn(),
}));

vi.mock('../config/sharepoint.config', () => ({ SHAREPOINT_CONFIG: { useMock: false } }));
vi.mock('../config/sharepointPaths', () => ({ SHAREPOINT_PATHS: mocks.paths }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/sharePointDocumentLibrariesSetup', () => ({
  ensureSharePointDocumentLibrariesReady: (...args) => mocks.ensureLibraries(...args),
}));
vi.mock('../services/sharePointPermissionsSetup', () => ({
  ensureUsersDbFolderPermissionsReady: (...args) => mocks.ensurePermissions(...args),
}));

import SharePointPermissionsSetupStatus from './SharePointPermissionsSetupStatus';
import { shouldRunBlockingSharePointSetupValidation } from '../utils/sharePointSetupContext';

const setupFailure = {
  ok: false,
  status: 'setup-failed',
  userMessage: 'הקמת ספריות SharePoint נכשלה.',
  technicalError: { step: 'validate-library', status: 500 },
  logs: [{ time: 'now', level: 'error', step: 'validate-library', message: 'failed' }],
};

const renderStatus = (route = '/admin') => render(
  <MemoryRouter initialEntries={[route]}>
    <SharePointPermissionsSetupStatus />
  </MemoryRouter>,
);

describe('SharePoint setup validation lifecycle ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SITE_BUILD_MODE', 'legacy');
    window.history.replaceState({}, '', '/sites/EnergyEfficiency/siteDB/dist/index.html#/admin');
    Object.assign(mocks.paths, {
      host: window.location.host,
      siteRoot: '/sites/EnergyEfficiency',
      siteDbFolder: 'siteDB',
      siteDbRoot: '/sites/EnergyEfficiency/siteDB',
      targetDistPath: '/sites/EnergyEfficiency/siteDB/dist',
      bootstrapLibrary: 'SiteAssets',
      bootstrapFolder: 'sitebuilder-bootstrap',
    });
    mocks.ensureLibraries.mockResolvedValue({ ok: true, status: 'already-configured', logs: [] });
    mocks.ensurePermissions.mockResolvedValue({ ok: true, status: 'already-configured', logs: [] });
  });

  it('does not run setup validation or show a setup modal for a healthy final-hosted admin app', async () => {
    renderStatus('/admin');
    await waitFor(() => expect(mocks.ensureLibraries).not.toHaveBeenCalled());
    expect(screen.queryByText('BOOTSTRAP SETUP FAILURE')).not.toBeInTheDocument();
  });

  it('does not promote a transient optional library probe failure into a blocking final-app modal', async () => {
    mocks.ensureLibraries.mockResolvedValue(setupFailure);
    renderStatus('/admin');
    await waitFor(() => expect(mocks.ensureLibraries).not.toHaveBeenCalled());
    expect(screen.queryByText(/validate-library/)).not.toBeInTheDocument();
    expect(screen.queryByText('BOOTSTRAP SETUP FAILURE')).not.toBeInTheDocument();
  });

  it('keeps real setup failure visible when physically hosted from the configured bootstrap root', async () => {
    window.history.replaceState({}, '', '/sites/EnergyEfficiency/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin');
    mocks.ensureLibraries.mockResolvedValue(setupFailure);
    renderStatus('/admin');
    expect(await screen.findByText('BOOTSTRAP SETUP FAILURE')).toBeInTheDocument();
    expect(screen.getAllByText('validate-library').length).toBeGreaterThan(0);
  });

  it('keeps explicit sharepoint-setup route validation strict even from the final-hosted artifact', async () => {
    mocks.ensureLibraries.mockResolvedValue(setupFailure);
    renderStatus('/admin/sharepoint-setup');
    expect(await screen.findByText('BOOTSTRAP SETUP FAILURE')).toBeInTheDocument();
    expect(mocks.ensureLibraries).toHaveBeenCalledOnce();
  });

  it('uses configured non-default final and bootstrap roots without hardcoded library names', () => {
    const runtimePaths = {
      host: 'portal.army.idf',
      siteRoot: '/sites/custom-site',
      siteDbFolder: 'RecordsDb',
      siteDbRoot: '/sites/custom-site/RecordsDb',
      targetDistPath: '/sites/custom-site/RecordsDb/dist',
      bootstrapLibrary: 'DeploymentAssets',
      bootstrapFolder: 'initial-load',
    };
    expect(shouldRunBlockingSharePointSetupValidation({
      routePath: '/admin',
      browserLocation: new URL('https://portal.army.idf/sites/custom-site/RecordsDb/dist/index.html'),
      runtimePaths,
    })).toBe(false);
    expect(shouldRunBlockingSharePointSetupValidation({
      routePath: '/admin',
      browserLocation: new URL('https://portal.army.idf/sites/custom-site/DeploymentAssets/initial-load/dist/index.html'),
      runtimePaths,
    })).toBe(true);
  });

  it('does not relabel final runtime data-operation failures as initial setup failures', () => {
    expect(shouldRunBlockingSharePointSetupValidation({
      routePath: '/admin',
      browserLocation: new URL(`http://${window.location.host}/sites/EnergyEfficiency/siteDB/dist/index.html`),
      runtimePaths: mocks.paths,
    })).toBe(false);
    renderStatus('/admin');
    expect(screen.queryByText(/initial SharePoint setup/i)).not.toBeInTheDocument();
  });
});
