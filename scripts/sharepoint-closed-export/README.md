# Closed SharePoint Export Kit

This kit is for closed/private SharePoint environments where Codex cannot access the real site.
It is read-only. It does not deploy, initialize, reset, upload, delete, or write to SharePoint.

For a concrete two-site example with fake local TXT files, see `MULTI_SITE_EXAMPLE.md` and:

```text
scripts/sharepoint-closed-export/examples/sharepoint-export-input/
```

## SharePoint-Hosted Export Helper

Use this when you are inside the closed environment and have the SharePoint WebDAV path available, the same way `site:init` works.

The installer writes only these helper files:

```text
/sites/<siteCode>/siteDB/siteAssets/export-helper/index.html
/sites/<siteCode>/siteDB/siteAssets/export-helper/export-helper.js
```

It does not write, initialize, reset, delete, or overwrite legacy TXT data.

Dry-run first:

```bash
npm run sharepoint:install-export-helper -- --site <siteCode> --dry-run
```

Install or update the helper page:

```bash
npm run sharepoint:install-export-helper -- --site <siteCode>
```

For a subsite path, pass the SharePoint-style path:

```bash
npm run sharepoint:install-export-helper -- --site Sites/siteName/subsite --dry-run
```

The script prints the exact URL to open, for example:

```text
https://portal.army.idf/sites/siteName/subsite/siteDB/siteAssets/export-helper/index.html
```

Open that URL in the authenticated SharePoint browser session, click `בדוק סטטוס קבצים`, then click `Download all site data`.

The browser downloads one JSON artifact containing manifest metadata, a report, raw TXT contents, and normalized legacy objects. Validate it locally:

```bash
npm run sharepoint:closed-validate -- --browser-export ~/Downloads/site-builder-sharepoint-hosted-export-<timestamp>.json
```

The artifact includes the real `siteCode`, so `--site` is optional for hosted helper downloads. You can still pass `--site <siteCode>` to override.

For multiple sites, install one helper per site:

```bash
npm run sharepoint:install-export-helper -- --all-sites --sites-config scripts/sharepoint-closed-export/install.sites.example.json --dry-run
```

The helper page exports one site at a time. After downloading artifacts from multiple sites, validate each artifact or copy the raw TXT files into the batch folder layout described below.

## What This Exports

The current legacy Site Builder TXT files are:

- `bihs_master_config_v1.txt`
- `users_data.txt`
- `events_data.txt`
- `nav_data.txt`
- `site_content_data.txt`
- `theme_data.txt`
- `widgets_data.txt`
- `external_links_data.txt`
- `gantt_data.txt`

By default most files live under:

```text
/sites/<siteCode>/siteDB/siteAssets/
```

`widgets_data.txt` may live under:

```text
/sites/<siteCode>/siteUsersDb/
```

That depends on `widgetsDbTarget` / `VITE_SP_WIDGETS_DB_TARGET`.

## Prerequisites

- Node.js on the computer where you will validate the files.
- Access to the SharePoint site in your normal browser or file explorer inside the closed environment.
- Do not provide credentials to these scripts. They do not need secrets.

## Recommended Path: Manual Folder Export

### One Site

```bash
mkdir -p sharepoint-export-input
```

In the SharePoint website/browser, download or copy the nine TXT files listed above.

Put them here:

```text
sharepoint-export-input/
  bihs_master_config_v1.txt
  users_data.txt
  events_data.txt
  nav_data.txt
  site_content_data.txt
  theme_data.txt
  widgets_data.txt
  external_links_data.txt
  gantt_data.txt
```

Validate and package the export:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --site <siteCode>
```

The validator parses JSON, rejects missing/empty/invalid files, calculates hashes, counts records, and creates a normalized artifact.

### Many Sites

For multiple live sites, keep each site isolated in its own folder:

```text
sharepoint-export-input/
  site-a/
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt
  site-b/
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt
```

If the real SharePoint site code contains slashes, spaces, Hebrew, or other characters that are awkward as a local folder name, create a safe local folder and add `site.export.json` inside it:

```json
{
  "siteCode": "Sites/real/site/code/or/subsite",
  "displayName": "Human readable site name",
  "siteRelativePath": "/Sites/real/site/code/or/subsite"
}
```

When `site.export.json` exists, the validator uses `siteCode` from that file instead of the folder name. The real site code is stored in every manifest and is used to calculate the planned Mongo collection name.

Validate all site folders:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

Equivalent explicit batch form:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --batch
```

## Terminal Export Path

Terminal export is only supported when SharePoint is mounted as a local/WebDAV filesystem on your own computer inside the closed environment.
It does not perform browser auth and does not ask for credentials.

1. Copy the template:

```bash
cp scripts/sharepoint-closed-export/export.config.example.json scripts/sharepoint-closed-export/export.config.json
```

2. Edit `export.config.json`:

```json
{
  "mode": "terminal",
  "siteCode": "my-site",
  "siteRelativePath": "/sites/my-site/subsite",
  "mountedRootPath": "\\\\portal.army.idf@SSL\\DavWWWRoot"
}
```

3. Run:

```bash
npm run sharepoint:closed-export -- --config scripts/sharepoint-closed-export/export.config.json
```

If your SharePoint access is browser-only, this command is not the right path. Use the manual folder export.

## Optional Browser Helper

`browser-helper.js` is provided for authenticated browser sessions. It is read-only and uses `fetch(..., { credentials: "include" })`.

Use it only from inside the real SharePoint browser session:

1. Open the SharePoint site page.
2. Open browser devtools console.
3. Optionally set:

```js
window.SITE_BUILDER_EXPORT_CONFIG = {
  siteCode: "my-site",
  siteRelativePath: "/sites/my-site/subsite",
  widgetsDbTarget: "users"
};
```

4. Paste/run the contents of:

```text
scripts/sharepoint-closed-export/browser-helper.js
```

5. It downloads a JSON helper file.

6. Validate it locally:

```bash
npm run sharepoint:closed-validate -- --browser-export ~/Downloads/site-builder-sharepoint-browser-export-<timestamp>.json --site <siteCode>
```

If browser console execution is blocked by policy, use the manual folder export.

## Export Artifact

Single-site validation creates:

```text
exports/sharepoint-closed/<timestamp>/
  manifest.json
  report.md
  raw/
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt
  normalized/
    legacy-objects.json
```

Open `report.md`. It shows `PASS`, `WARNING`, or `FAIL` and the exact Mongo dry-run command.

Batch validation creates:

```text
exports/sharepoint-closed/<batchExportId>/
  manifest.json
  report.md
  sites/
    <safeSiteFolderA>/
      manifest.json
      report.md
      raw/
      normalized/
        legacy-objects.json
    <safeSiteFolderB>/
      manifest.json
      report.md
      raw/
      normalized/
        legacy-objects.json
```

The root `manifest.json` contains the batch status, all discovered sites, per-site missing/empty/invalid file summaries, hashes, target Mongo collection names, and a collection collision check.

## Mongo Dry-Run From Export

For one exported site, run the command printed in the site report, for example:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<timestamp> --site <siteCode>
```

For one site inside a batch:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<batchExportId>/sites/<safeSiteFolder> --site <siteCode>
```

For all sites inside a batch:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<batchExportId> --all-sites
```

This dry-run reads only the local export artifact. It does not access SharePoint and does not write Mongo data.

## What Must Not Be Done

- Do not run `site:init` for this export.
- Do not run deploy scripts.
- Do not upload these exported files back to SharePoint.
- Do not delete or reset SharePoint files.
- Do not run a real Mongo migration until dry-run counts and hashes are reviewed.
- Do not use `--force` during this export validation phase.
- Do not place files for different sites in one flat folder. Use one folder per site for batch exports.
