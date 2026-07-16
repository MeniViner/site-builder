# Local MongoDB Dev And Test Setup

This setup is for local development with either Docker MongoDB or native Windows MongoDB.

It does not access SharePoint, deploy, run a real migration, or write production MongoDB data.

## 1. Install Prerequisites

For Docker-based local dev, install:

- Docker Desktop for Mac
- Node.js matching this project
- npm dependencies with `npm install`

For native Windows local dev, install MongoDB Community Server instead of Docker. See:

```text
docs/WINDOWS_NATIVE_MONGO_LOCAL_DEV_HE.md
```

## 2. Start Local MongoDB

The project uses `docker-compose.dev.yml` with the official MongoDB Community Server image:

```text
mongodb/mongodb-community-server:7.0-ubuntu2204
```

It runs a single local MongoDB node with replica set name `rs0`.

Start it:

```bash
npm run dev:mongo:up
```

Check logs:

```bash
npm run dev:mongo:logs
```

Open a Mongo shell:

```bash
npm run dev:mongo:shell
```

Stop it:

```bash
npm run dev:mongo:down
```

Mongo is exposed only on:

```text
localhost:27017
```

Dev connection string:

```text
mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true
```

Test connection string:

```text
mongodb://localhost:27017/site_builder_test?replicaSet=rs0&directConnection=true
```

The replica set is useful because it is closer to production write concern behavior and keeps the setup ready for future transaction support. It is still a single local node, so it is not a high availability setup.

### Native MongoDB (Windows, supported)

If you are on Windows and cannot run Docker, you can run MongoDB Server as a local Windows service on `127.0.0.1:27017` and use:

```bash
npm run dev:mongo:native:check
npm run server:dev
npm run test:server:mongo:native
```

Native standalone MongoDB does not need `replicaSet=rs0` in the URI.

Use the companion doc for exact PowerShell steps:

`docs/WINDOWS_NATIVE_MONGO_LOCAL_DEV_HE.md`

## 3. Create Local Env Files

Copy the examples:

```bash
cp .env.local.example .env.local
cp server/.env.local.example server/.env.local
cp server/.env.test.example server/.env.test
cp server/.env.local.native.example server/.env.local.native
cp server/.env.test.native.example server/.env.test.native
```

Frontend local env:

```text
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://localhost:3001
VITE_SITE_ID=local-dev-site
VITE_SITE_BUILDER_DEV_API_KEY=dev-local-api-key
VITE_AUTO_DEPLOY=false
```

Backend local env:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/site_builder_dev?directConnection=true
MONGODB_DB_NAME=site_builder_dev
SERVER_PORT=3001
CORS_ORIGINS=https://portal.army.idf,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
STORAGE_BACKEND=mongo
ADMIN_API_KEY=dev-local-api-key
SITE_COLLECTION_PREFIX=site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

Backend test env:

```text
MONGODB_URI=mongodb://localhost:27017/site_builder_test?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_test
SERVER_PORT=3002
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
STORAGE_BACKEND=mongo
ADMIN_API_KEY=test-local-api-key
SITE_COLLECTION_PREFIX=test_site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

## 4. Run Preflight

Run:

```bash
npm run dev:mongo:check
```

or for native setup:

```bash
npm run dev:mongo:native:check
```

It checks:

- Docker is installed
- Docker daemon is running
- Docker Compose is available
- Mongo container is running
- dev/test Mongo databases are reachable
- backend env files have Mongo URI, DB name, API key, and CORS
- frontend env has Mongo mode, backend API URL, and `VITE_AUTO_DEPLOY=false`

The output is `PASS`, `WARNING`, or `FAIL`.

## 5. Run Backend And Frontend

Backend:

```bash
npm run server:dev:mongo
```

Native mode:

```bash
npm run server:dev
npm run dev:frontend:mongo:native
```

Frontend:

```bash
npm run dev:frontend:mongo
```

Open:

```text
http://localhost:5173
```

## 6. Run Tests Safely

Unit/server tests use in-memory repositories unless an explicit integration path is added later. They do not silently hit dev or production MongoDB.

Run server tests with local test env loaded:

```bash
npm run test:server:mongo
```

Run all tests:

```bash
npm test -- --run
```

## 6a. SharePoint-Hosted Frontend Runtime Config

For local testing where the frontend is hosted from SharePoint but the backend runs locally, use HTTP:

```json
{
  "storageBackend": "mongo",
  "backendApiUrl": "http://127.0.0.1:3001",
  "siteId": "alphateam",
  "apiKey": "dev-local-api-key"
}
```

For a real server later:

```json
{
  "storageBackend": "mongo",
  "backendApiUrl": "https://<server-domain>",
  "siteId": "<siteId>",
  "apiKey": "<api-key>"
}
```

`CORS_ORIGINS` must include the SharePoint origin only, for example `https://portal.army.idf`, without `/sites/...`.

## 6b. SharePoint Export To Mongo Flow

Validate:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

Dry-run only:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export <batch-export-dir> --all-sites
```

Real local import for one site:

```bash
npm run migrate:sharepoint-to-mongo -- --from-export <batch-export-dir>/sites/<safe-site-folder> --site <real-site-id>
```

`migrate:sharepoint-to-mongo` loads `server/.env.local`. There is no `migrate:sharepoint-export-to-mongo` script without `:dry-run`.

## 7. Reset Local MongoDB

This only drops:

```text
site_builder_dev
site_builder_test
```

It refuses non-local MongoDB URIs and refuses production-looking database names.

Run:

```bash
npm run dev:mongo:reset -- --confirm-local-reset
```

Without `--confirm-local-reset`, reset exits without doing anything.

## 8. What Not To Do

- Do not use `.env.production` for local Mongo dev.
- Do not point `MONGODB_URI` at production.
- Do not run `deploy`.
- Do not run `site:init`.
- Do not run a real migration.
- Do not copy exported SharePoint TXT files back into SharePoint.
- Do not use `--force` on migration commands during local validation.

## 9. Closed Environment Dependency Notes

- Do not delete existing `node_modules` in a closed environment unless a compatible reinstall path is ready.
- Do not copy Mac `node_modules` to Windows.
- If no npm registry exists, prepare Windows-compatible dependencies in advance.
- MongoDB Compass is not MongoDB Server.
- `ECONNREFUSED 127.0.0.1:27017` means MongoDB Server is stopped or not listening on that address.

## 10. Site Routing And Collection Names

- `sites.siteId` is the logical site id used by the API and frontend.
- `sites.safeCollectionName` is the physical Mongo collection name.
- Existing sites resolve through `sites.safeCollectionName`; do not rename live collections automatically.
- `SITE_COLLECTION_PREFIX` only affects newly generated collection names.
- For local repair, dry-run first: rename the collection manually in MongoDB, then update that site document's `safeCollectionName` to the new collection name. Never do this against production from a local dev flow.

## 11. Admin Backups In Mongo

In Mongo frontend mode, Admin Backup Management stores backup packages in the current site's own collection. It does not use browser `localStorage` as the primary backup store.

Document shape:

```js
{
  _id: "backup:<backupId>",
  siteId: "<siteId>",
  scope: "backups",
  entityId: "<backupId>",
  data: {
    backupId: "<backupId>",
    name: "...",
    description: "...",
    createdAt: "...",
    createdBy: "...",
    source: "admin-backup-management",
    summary: {},
    snapshot: {},
    sizeBytes: 0,
    storageBackend: "mongo",
    siteId: "<siteId>"
  },
  version: 1,
  schemaVersion: 1,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: null
}
```

To find backups in MongoDB Compass:

1. Open `site_builder_dev`.
2. Open the `sites` collection and find the site record for the logical `siteId`.
3. Copy `safeCollectionName`.
4. Open that collection and filter:

```js
{ scope: "backups", deletedAt: null }
```

Live site data and admin backups live in the same per-site collection but use different scopes. `site_data_revisions` stores automatic before/after snapshots, and `site_data_audit_logs` stores create/delete/restore audit entries. Legacy localStorage backup packages remain local-only and are not automatically imported to Mongo.

Backups are stored as one Mongo document with a size guard. If a package is too large, creation fails with a clear error; chunked backup storage is a future follow-up.
