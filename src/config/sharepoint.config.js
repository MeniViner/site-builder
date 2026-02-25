export const SHAREPOINT_CONFIG = {
    // Set to true for local development completely separated from SharePoint
    useMock: import.meta.env.MODE === 'development' || import.meta.env.VITE_USE_MOCK === 'true',

    // The key used to store data in localStorage during mock mode
    mockStorageKey: 'bihs_events_data',
    navMockStorageKey: 'bihs_nav_data',
    usersMockStorageKey: 'bihs_users_data',

    // The server-relative URL to the .txt file in SharePoint
    // e.g., '/sites/YourSite/Shared Documents/events_data.txt'
    fileServerRelativeUrl: import.meta.env.VITE_SP_EVENTS_FILE_URL || '/sites/bihs7134/SiteAssets/events_data.txt',
    navFileServerRelativeUrl: import.meta.env.VITE_SP_NAV_FILE_URL || '/sites/bihs7134/SiteAssets/nav_data.txt',
    usersFileServerRelativeUrl: import.meta.env.VITE_SP_USERS_FILE_URL || '/sites/bihs7134/SiteAssets/users_data.txt'
};
