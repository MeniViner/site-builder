// src/config/sharepoint.config.js
import { SHAREPOINT_PATHS } from './sharepointPaths';

const isDevMode = import.meta.env.MODE === 'development';
const isForcedMock = import.meta.env.VITE_USE_MOCK === 'true';
const isEnvMockAdminBypassEnabled = import.meta.env.VITE_ALLOW_MOCK_ADMIN_BYPASS === 'true';

export const SHAREPOINT_CONFIG = {
    useMock: isDevMode || isForcedMock,
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

    // SharePoint file URLs (production mode)
    fileServerRelativeUrl: import.meta.env.VITE_SP_EVENTS_FILE_URL || SHAREPOINT_PATHS.eventsFileServerRelativeUrl,
    navFileServerRelativeUrl: import.meta.env.VITE_SP_NAV_FILE_URL || SHAREPOINT_PATHS.navigationFileServerRelativeUrl,
    usersFileServerRelativeUrl: import.meta.env.VITE_SP_USERS_FILE_URL || SHAREPOINT_PATHS.usersFileServerRelativeUrl,
    siteContentFileServerRelativeUrl: import.meta.env.VITE_SP_SITE_CONTENT_FILE_URL || SHAREPOINT_PATHS.siteContentFileServerRelativeUrl,
    themeFileServerRelativeUrl: import.meta.env.VITE_SP_THEME_FILE_URL || SHAREPOINT_PATHS.themeFileServerRelativeUrl,
    widgetsFileServerRelativeUrl: import.meta.env.VITE_SP_WIDGETS_FILE_URL || SHAREPOINT_PATHS.widgetsFileServerRelativeUrl,
    externalLinksFileServerRelativeUrl: import.meta.env.VITE_SP_EXTERNAL_LINKS_FILE_URL || SHAREPOINT_PATHS.externalLinksFileServerRelativeUrl,
};
