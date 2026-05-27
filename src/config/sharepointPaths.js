// src/config/sharepointPaths.js
const normalizePathSegment = (value, fallback) => {
    const raw = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
    return raw || fallback;
};

const normalizeSiteCode = (value) => {
    const raw = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
    return raw || 'siteBuilder';
};

const toServerRelativePath = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) {
        try {
            return new URL(raw).pathname;
        } catch {
            return '';
        }
    }

    return raw.startsWith('/') ? raw.replace(/\/+$/g, '') : '';
};

const lastPathSegment = (value, fallback) => {
    const serverRelative = toServerRelativePath(value);
    const source = serverRelative || String(value ?? '');
    const segment = source.split('/').filter(Boolean).pop();
    return normalizePathSegment(segment, fallback);
};

const siteCode = normalizeSiteCode(import.meta.env.VITE_SP_SITE_CODE);
const host = String(import.meta.env.VITE_SP_HOST || 'portal.army.idf').trim() || 'portal.army.idf';
const siteDbFolder = normalizePathSegment(import.meta.env.VITE_SP_SITE_DB_FOLDER, 'siteDB');
const usersDbFolder = lastPathSegment(import.meta.env.VITE_SP_USERS_DB_FOLDER, 'siteUsersDb');
const siteAssetsFolder = normalizePathSegment(import.meta.env.VITE_SP_SITE_ASSETS_FOLDER, 'siteAssets');
const imagesFolder = normalizePathSegment(import.meta.env.VITE_SP_IMAGES_FOLDER, 'images');
const widgetsDbTarget = String(import.meta.env.VITE_SP_WIDGETS_DB_TARGET || 'users').trim().toLowerCase();

const siteRoot = `/sites/${siteCode}`;
const siteDbRoot = `${siteRoot}/${siteDbFolder}`;
const configuredUsersDbRoot = toServerRelativePath(import.meta.env.VITE_SP_USERS_DB_FOLDER);
const usersDbRoot = configuredUsersDbRoot || `${siteRoot}/${usersDbFolder}`;
const siteAssetsRoot = `${siteDbRoot}/${siteAssetsFolder}`;
const imagesRoot = `${siteDbRoot}/${imagesFolder}`;

const defaultSiteBaseUrl = `https://${host}${siteDbRoot}/dist`;
const siteApiRoot = String(import.meta.env.VITE_SP_SITE_API_ROOT || siteRoot).trim() || siteRoot;

const resolveFilePath = (fileName, dbTarget = 'site') => {
    const normalizedTarget = String(dbTarget || 'site').trim().toLowerCase();
    if (normalizedTarget === 'users') {
        return `${usersDbRoot}/${fileName}`;
    }
    return `${siteAssetsRoot}/${fileName}`;
};

const widgetsDb = widgetsDbTarget === 'site' ? 'site' : 'users';

export const SHAREPOINT_PATHS = {
    host,
    siteCode,
    siteRoot,
    siteApiRoot,
    siteDbFolder,
    usersDbFolder,
    siteDbRoot,
    usersDbRoot,
    siteAssetsFolder,
    siteAssetsRoot,
    imagesFolder,
    imageBaseFolderServerRelativeUrl: imagesRoot,
    siteBaseUrl: defaultSiteBaseUrl,
    eventsFileServerRelativeUrl: resolveFilePath('events_data.txt', 'site'),
    navigationFileServerRelativeUrl: resolveFilePath('nav_data.txt', 'site'),
    usersFileServerRelativeUrl: resolveFilePath('users_data.txt', 'site'),
    siteContentFileServerRelativeUrl: resolveFilePath('site_content_data.txt', 'site'),
    themeFileServerRelativeUrl: resolveFilePath('theme_data.txt', 'site'),
    widgetsFileServerRelativeUrl: resolveFilePath('widgets_data.txt', widgetsDb),
    externalLinksFileServerRelativeUrl: resolveFilePath('external_links_data.txt', 'site'),
    ganttFileServerRelativeUrl: resolveFilePath('gantt_data.txt', 'site'),
    masterConfigFileServerRelativeUrl: resolveFilePath('bihs_master_config_v1.txt', 'site'),
};

export default SHAREPOINT_PATHS;
