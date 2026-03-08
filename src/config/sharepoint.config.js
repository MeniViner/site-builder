export const SHAREPOINT_CONFIG = {
    useMock: import.meta.env.MODE === 'development' || import.meta.env.VITE_USE_MOCK === 'true',

    // localStorage keys (mock mode)
    mockStorageKey: 'bihs_events_data',
    navMockStorageKey: 'bihs_nav_data',
    usersMockStorageKey: 'bihs_users_data',
    siteContentMockStorageKey: 'bihs_site_content_data',
    themeMockStorageKey: 'bihs_theme_data',
    widgetsMockStorageKey: 'bihs_widgets_data',
    externalLinksMockStorageKey: 'bihs_external_links_data',

    // SharePoint file URLs (production mode)
    fileServerRelativeUrl: import.meta.env.VITE_SP_EVENTS_FILE_URL || '/sites/bihs7134/SiteAssets/events_data.txt',
    navFileServerRelativeUrl: import.meta.env.VITE_SP_NAV_FILE_URL || '/sites/bihs7134/SiteAssets/nav_data.txt',
    usersFileServerRelativeUrl: import.meta.env.VITE_SP_USERS_FILE_URL || '/sites/bihs7134/SiteAssets/users_data.txt',
    siteContentFileServerRelativeUrl: import.meta.env.VITE_SP_SITE_CONTENT_FILE_URL || '/sites/bihs7134/SiteAssets/site_content_data.txt',
    themeFileServerRelativeUrl: import.meta.env.VITE_SP_THEME_FILE_URL || '/sites/bihs7134/SiteAssets/theme_data.txt',
    widgetsFileServerRelativeUrl: import.meta.env.VITE_SP_WIDGETS_FILE_URL || '/sites/bihs7134/SiteAssets/widgets_data.txt',
    externalLinksFileServerRelativeUrl: import.meta.env.VITE_SP_EXTERNAL_LINKS_FILE_URL || '/sites/bihs7134/SiteAssets/external_links_data.txt',
};
