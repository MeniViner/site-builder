# Local MongoDB Dev And Test Setup

This setup is for local Mac development only.

It does not access SharePoint, deploy, run a real migration, or write production MongoDB data.

## 1. Install Prerequisites

Install:

- Docker Desktop for Mac
- Node.js matching this project
- npm dependencies with `npm install`

MongoDB runs through Docker Compose. Do not install or run a system MongoDB service for this project.

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

## 3. Create Local Env Files

Copy the examples:

```bash
cp .env.local.example .env.local
cp server/.env.local.example server/.env.local
cp server/.env.test.example server/.env.test
```

Frontend local env:

```text
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://localhost:3001
VITE_SITE_ID=local-dev-site
VITE_SITE_BUILDER_API_KEY=dev-local-api-key
VITE_AUTO_DEPLOY=false
```

Backend local env:

```text
MONGODB_URI=mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_dev
SERVER_PORT=3001
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
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
