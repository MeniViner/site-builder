/*
 * Closed SharePoint Export Browser Helper
 *
 * Read-only helper for use from an authenticated SharePoint browser session.
 * It fetches the legacy TXT files with credentials: "include" and downloads
 * one JSON file that can be validated locally with validate-manual-export.mjs.
 *
 * Optional override before running:
 * window.SITE_BUILDER_EXPORT_CONFIG = {
 *   siteCode: "my-site",
 *   siteRelativePath: "/sites/my-site/subsite",
 *   widgetsDbTarget: "users"
 * };
 */
(async () => {
  const cfg = {
    siteCode: 'siteBuilder',
    siteRelativePath: '',
    documentLibraryName: 'siteDB',
    usersDocumentLibraryName: 'siteUsersDb',
    siteAssetsFolder: 'siteAssets',
    widgetsDbTarget: 'users',
    legacyFolderPath: '',
    usersLegacyFolderPath: '',
    ...(window.SITE_BUILDER_EXPORT_CONFIG || {}),
  };

  const normalizePath = (value) => {
    const raw = String(value || '').trim();
    const cleaned = raw.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/g, '');
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  };

  const siteRelativePath = normalizePath(
    cfg.siteRelativePath || window.location.pathname.split('/SiteAssets/')[0] || `/sites/${cfg.siteCode}`,
  );
  const legacyFolderPath = normalizePath(
    cfg.legacyFolderPath || `${siteRelativePath}/${cfg.documentLibraryName}/${cfg.siteAssetsFolder}`,
  );
  const usersLegacyFolderPath = normalizePath(
    cfg.usersLegacyFolderPath || `${siteRelativePath}/${cfg.usersDocumentLibraryName}`,
  );

  const files = [
    ['masterConfig', 'bihs_master_config_v1.txt', legacyFolderPath],
    ['users', 'users_data.txt', legacyFolderPath],
    ['events', 'events_data.txt', legacyFolderPath],
    ['navigation', 'nav_data.txt', legacyFolderPath],
    ['siteContent', 'site_content_data.txt', legacyFolderPath],
    ['theme', 'theme_data.txt', legacyFolderPath],
    ['widgets', 'widgets_data.txt', cfg.widgetsDbTarget === 'site' ? legacyFolderPath : usersLegacyFolderPath],
    ['externalLinks', 'external_links_data.txt', legacyFolderPath],
    ['gantt', 'gantt_data.txt', legacyFolderPath],
  ].map(([key, fileName, folder]) => ({
    key,
    fileName,
    serverRelativePath: normalizePath(`${folder}/${fileName}`),
  }));

  const confirmed = window.confirm(
    'This read-only helper will fetch legacy Site Builder TXT files and download a JSON export helper file. It will not write to SharePoint. Continue?',
  );
  if (!confirmed) return;

  const results = [];
  for (const file of files) {
    const response = await fetch(file.serverRelativePath, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'text/plain, */*' },
    });
    const text = await response.text();
    results.push({
      ...file,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      sizeBytes: new TextEncoder().encode(text).byteLength,
      text: response.ok ? text : '',
      error: response.ok ? '' : text.slice(0, 500),
    });
  }

  const createdAt = new Date().toISOString();
  const payload = {
    kind: 'site-builder-closed-sharepoint-browser-export',
    createdAt,
    siteCode: cfg.siteCode,
    sourceUrl: window.location.href,
    readOnly: true,
    files: results,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `site-builder-sharepoint-browser-export-${createdAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  console.log('[Site Builder Export Helper] Downloaded read-only export helper payload:', payload);
})();
