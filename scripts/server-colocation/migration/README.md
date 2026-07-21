# Site Builder Mongo transfer tooling

This directory contains offline, configuration-driven tooling for the future transfer of the Builder data plane only. It never reads or modifies the HUB control database and it does not infer identity from `siteCode`.

## Required environment

Set these values outside the package. Do not commit or place credentials in command lines:

```text
MIGRATION_SOURCE_MONGODB_URI=
MIGRATION_SOURCE_DB_NAME=
MIGRATION_TARGET_MONGODB_URI=
MIGRATION_TARGET_DB_NAME=
```

`inventory.mjs` is read-only. `export.mjs` requires `--execute --confirm SITEBUILDER_SOURCE_EXPORT` and an official `mongodump` executable. It writes a BSON archive, inventory and checksum manifest into a new output directory. `import-dry-run.mjs` validates an archive and requires an empty target. `import.mjs` is intentionally a fail-closed guard: this rehearsal package ships no applying importer.

Use `verify.mjs` only after independently approved import tooling has created a target inventory. It compares counts, options, indexes, `_id` type summaries and registry-to-physical collection mappings. `rollback-plan.mjs` produces evidence-preserving instructions only; it cannot delete, rename, or switch any runtime configuration.

## Mapping manifest

`mapping-manifest.mjs` accepts a JSON object with `rows`. Every row contains the listed fields from `lib/core.mjs`. Rows that cannot be independently resolved must use `migrationState: "unresolved"`; they are retained but cannot authorize a cutover.
