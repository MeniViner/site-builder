# Multi-Site Closed SharePoint Export Example

This example is offline-only. It does not access SharePoint, write MongoDB, deploy, initialize, or reset anything.

## Example Input Folder

Recommended structure for two sites:

```text
sharepoint-export-input/
  demo-main-site/
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt

  demo-subsite-safe-folder/
    site.export.json
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

A ready-made fake example tree lives here:

```text
scripts/sharepoint-closed-export/examples/sharepoint-export-input/
```

## `site.export.json` Example

Use `site.export.json` when the real SharePoint site code/path contains slashes, spaces, Hebrew, or a subsite path that is not safe as a local folder name.

```json
{
  "siteCode": "Sites/demo-main-site/subsite-a",
  "displayName": "Demo Subsite A",
  "siteRelativePath": "/Sites/demo-main-site/subsite-a"
}
```

When this file exists, the export kit uses `siteCode` from the JSON file instead of the local folder name.

## Batch Validation Command

For your real local export folder:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

To validate the fake example tree in this repo:

```bash
npm run sharepoint:closed-validate -- --input scripts/sharepoint-closed-export/examples/sharepoint-export-input --all-sites
```

## Report File To Open

After validation, open:

```text
exports/sharepoint-closed/<batchExportId>/report.md
```

The terminal output prints the exact `exportDir` to use.

## Mongo Dry-Run Command

After the batch report is `PASS` or acceptable `WARNING`, run:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<batchExportId> --all-sites
```

This is dry-run only. It reads the local artifact and should not write MongoDB.

## Warnings Before Copying Real TXT Files

- Keep each SharePoint site in its own folder.
- Do not mix TXT files from different sites.
- Do not rename the nine legacy TXT files.
- Do not create empty placeholder TXT files.
- Add `site.export.json` for subsite paths or unsafe real site codes.
- Review `report.md` before running the Mongo dry-run.
- Do not run `site:init`, deploy, or any real migration command during export validation.
