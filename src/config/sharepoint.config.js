// src/config/sharepoint.config.js
import { SHAREPOINT_PATHS } from './sharepointPaths';
import { isLocalDevStorageBackend } from '../services/storage/storageBackend';

const isDevMode = import.meta.env.MODE === 'development';
const isForcedMock = import.meta.env.VITE_USE_MOCK === 'true';
const isEnvMockAdminBypassEnabled = import.meta.env.VITE_ALLOW_MOCK_ADMIN_BYPASS === 'true';

export const SHAREPOINT_CONFIG = {
    // Authentication can stay mocked during development, independently of the
    // selected persistence backend.
    useMock: isDevMode || isForcedMock,
    // localStorage is a development transport only for an explicitly selected
    // TXT frontend. Mongo development must never read or migrate localStorage.
    useMockStorage: isLocalDevStorageBackend(),
    // Development must always keep admin mode available.
    allowMockAdminBypass: isDevMode || isEnvMockAdminBypassEnabled,

    // localStorage keys (mock mode)
    mockStorageKey: 'bihs_events_data',
    navMockStorageKey: 'bihs_nav_data',
    usersMockStorageKey: 'bihs_users_data',
    siteContentMockStorageKey: 'bihs_site_content_data',
    themeMockStorageKey: 'bihs_theme_data',
    widgetsMockStorageKey: 'bihs_widgets_data',
    externalLinksMockStorageKey: 'bihs_external_links_data',
    ganttMockStorageKey: 'bihs_gantt_data',
    boomMockStorageKey: 'bihs_boom_data',

    // SharePoint file URLs (production mode)
    fileServerRelativeUrl: SHAREPOINT_PATHS.eventsFileServerRelativeUrl,
    navFileServerRelativeUrl: SHAREPOINT_PATHS.navigationFileServerRelativeUrl,
    usersFileServerRelativeUrl: SHAREPOINT_PATHS.usersFileServerRelativeUrl,
    siteContentFileServerRelativeUrl: SHAREPOINT_PATHS.siteContentFileServerRelativeUrl,
    themeFileServerRelativeUrl: SHAREPOINT_PATHS.themeFileServerRelativeUrl,
    widgetsFileServerRelativeUrl: SHAREPOINT_PATHS.widgetsFileServerRelativeUrl,
    externalLinksFileServerRelativeUrl: SHAREPOINT_PATHS.externalLinksFileServerRelativeUrl,
    ganttFileServerRelativeUrl: SHAREPOINT_PATHS.ganttFileServerRelativeUrl,
    boomFileServerRelativeUrl: SHAREPOINT_PATHS.boomFileServerRelativeUrl,
};
