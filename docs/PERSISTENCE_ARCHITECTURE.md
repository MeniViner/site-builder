# Site Builder persistence and deployment

## One active repository

The application accepts exactly two storage backends:

- `txt` — the SharePoint-hosted `bihs_master_config_v1.txt` file is the live UI source of truth.
- `mongo` — the Site Builder backend API and the configured logical `siteId` are the live source of truth.

Navigation folders, network-folder targets, homepage links, external-link cards, theme, content, events, and most widget configuration are branches of the master config. `nav_data.txt` and `external_links_data.txt` remain import/export compatibility files; the active UI does not independently select or write them. `widgets_data.txt`, `users_data.txt`, and `gantt_data.txt` still serve their documented specialist flows.

There is no dual-write mode. A save is serialized through the master-config repository chosen during bootstrap. A failed save remains visible as dirty optimistic state and is not reported as saved.

## Resolution and precedence

Storage is resolved once, before storage-dependent application modules are imported. The source is selected by the immutable build mode:

1. A legacy `npm run build` artifact uses its compiled `.env.production` values and does not read or require a runtime JSON file.
2. A universal `npm run build:universal` artifact requires a valid `sitebuilder-runtime-config.json` next to `index.html`.
3. Development may use its Vite environment fallback.

Only the exact, case-sensitive strings `txt` and `mongo` are valid; values such as `TXT`, `MONGO`, `local-dev`, and `unknown` are rejected. An invalid explicit value stops startup. An explicit Mongo selection without both a public backend URL and logical site ID also stops startup; it never falls back to TXT.

`sitebuilder-deployment.json` is audit evidence. It cannot override runtime settings. If its backend disagrees with the runtime selector, startup fails visibly.

The runtime loader handles `index.html#/`, `dist/#/`, and a bare `dist` path, reads responses as text, and rejects HTML before JSON parsing. The bootstrap snapshot is available at `window.__SITE_BUILDER_STORAGE_DIAGNOSTICS__`; call `window.__SITE_BUILDER_GET_STORAGE_DIAGNOSTICS__()` for the latest save error. Neither contains credentials.

If startup is blocked before a storage descriptor can be created, the page shows a fail-closed configuration error and exposes the redacted loader evidence at `window.__SITE_BUILDER_RUNTIME_DIAGNOSTICS__`.

## Runtime selector examples

Production TXT:

```json
{
  "schemaVersion": 1,
  "storageBackend": "txt",
  "siteId": "target-site",
  "allowedSiteRoot": "https://portal.example/sites/target-site"
}
```

Production Mongo:

```json
{
  "schemaVersion": 1,
  "storageBackend": "mongo",
  "siteId": "target-site",
  "backendApiUrl": "https://builder-api.example",
  "allowedSiteRoot": "https://portal.example/sites/target-site"
}
```

Never put an API key, database credential, password, or bearer token in this file. A production Mongo API must be exposed through an approved authenticated session or same-origin gateway. The Vite dev key is development-only and is erased by the production build wrapper.

## Environment configuration

Site Builder production build variables:

```dotenv
VITE_STORAGE_BACKEND=txt
VITE_SITE_ID=
VITE_BACKEND_API_URL=
```

For a Mongo-specific build, use `VITE_STORAGE_BACKEND=mongo` and provide `VITE_SITE_ID` and `VITE_BACKEND_API_URL`. A target-specific Hub deployment still overwrites the selector for its destination.

SiteBuilderHub has one production authority:

```dotenv
SITE_BUILDER_PRODUCTION_STORAGE_BACKEND=txt
```

Missing or blank resolves to TXT. `mongo` must be set explicitly. Invalid values block Hub startup/deployment. The site registry, presence of migrated data, API health, and a previous runtime file cannot activate Mongo by themselves.

## Build and deployment

`npm run build` uses the isolated historical Legacy path in `scripts/build-legacy.mjs`: Vite reads `.env.production` and writes the site-specific application directly to `dist`. The Legacy postbuild writes a Legacy-only build-ID/SHA-256 manifest, checks the two SharePoint libraries, and routes to final or bootstrap deployment. WebDAV destination creation is delegated to robocopy; Node recursive `mkdir` is never used against that UNC target. `npm run deploy` copies dependencies before the entry point and commits `index.html` last; it neither creates nor requires a runtime selector.

`npm run build:universal` creates the separate `dist-universal` Release Manager artifact. It contains no SharePoint site identity, requires a runtime selector in production, and writes `sharepoint-deploy-manifest.json` only after isolated staging validation. It never invokes Legacy postbuild or changes Legacy `dist`. Release Manager supplies `sitebuilder-runtime-config.json` and optional deployment metadata at its target.

TXT deployment requires the expected TXT files to exist. Mongo deployment requires a valid backend URL/site ID and a successful readiness check.

SiteBuilderHub resolves its production backend from `SITE_BUILDER_PRODUCTION_STORAGE_BACKEND` for every deployment, verifies release compatibility, creates a target-specific selector for TXT or Mongo, and includes generated selector/metadata in read-back evidence. Mongo deploy is blocked until the API and site data are ready; TXT deploy is blocked if the required TXT data inventory is missing.

## Local development

Local TXT uses the real application repository contract with the development local-storage transport:

```sh
VITE_STORAGE_BACKEND=txt npm run dev
```

Local Mongo:

```sh
npm run dev:mongo:up
npm run dev:mongo:check
npm run server:dev:mongo
VITE_STORAGE_BACKEND=mongo \
VITE_BACKEND_API_URL=http://127.0.0.1:3001 \
VITE_SITE_ID=local-dev-site \
npm run dev
```

If the local server requires its development API key, pass it only through `VITE_SITE_BUILDER_DEV_API_KEY` in the development process. Production builds forcibly remove that variable.

## Nested SharePoint hosting

Assets use a relative Vite base. Runtime files are resolved beside the loaded HTML, including paths such as:

```text
https://portal.example/sites/alpha/siteDB/dist/index.html#/
```

For TXT, the master-config path is derived from the validated hosted/runtime site root and the configured folder names. A runtime site root that disagrees with the browser’s hosted site root is fatal; the application will not read or write a different SharePoint site because of a baked site code.

## Migration and activation

Export and migration are data-only operations. They never change the active backend.

Run a non-destructive dry run:

```sh
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export /absolute/path/to/export --site target-site
```

Review the generated report for source/destination counts, skipped/invalid entries, IDs, and digests. Import with overwrite disabled, verify Mongo against the TXT export, and retain the TXT files.

Activation is a separate operator action:

1. Confirm a successful TXT backup/export.
2. Run and review the migration dry run.
3. Import without switching and verify counts/digests in Mongo.
4. Deploy the authenticated Mongo API/gateway and verify the target `siteId` is reachable and populated.
5. Change `SITE_BUILDER_PRODUCTION_STORAGE_BACKEND` from `txt` to `mongo` explicitly.
6. Deploy a compatible release and verify selector/metadata read-back plus browser diagnostics.
7. Exercise add, edit, delete, reload, navigation, and every homepage layout before closing the change.

To roll back, set the production selector back to `txt` and deploy again. Do not copy Mongo data over TXT automatically and do not delete either data source. Reconcile intentional changes separately after service is stable.

## Operator verification

In the browser console inspect:

```js
window.__SITE_BUILDER_GET_STORAGE_DIAGNOSTICS__()
```

Verify `backend`, `source`, `siteId`, `siteRoot`/`backendApiUrl`, `repository`, runtime attempts, and the last redacted error. For a universal deployment, also fetch `sitebuilder-runtime-config.json`, `sitebuilder-deployment.json`, and `sharepoint-deploy-manifest.json` beside the loaded HTML. Legacy deployments intentionally need none of those runtime files.
