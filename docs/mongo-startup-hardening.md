# Site Builder Mongo startup hardening

Normal server startup connects with the existing native driver, logs only a sanitized target alias/database/topology, and performs read-only collection/index inspection. It no longer calls `SiteDataRepository.initIndexes()`.

The exported index definitions remain the single source for repository provisioning, inspection and explicit migration. Existing `ensureSite()` behavior is unchanged: explicit/lazy site creation inserts the registry record and creates the same three physical collection indexes. Separating that request-time provisioning behavior is a future decision, not part of S1.

```bash
npm run mongo:indexes -- --dry-run
npm run mongo:indexes -- --dry-run --json
npm run mongo:indexes -- --apply --confirm BUILDER_INDEX_MIGRATION
```

Dry-run is the default and performs no writes. Apply creates only missing current global indexes and indexes on known existing physical collections. It never renames collections, changes documents, or changes physical names, and refuses mismatched existing definitions. Apply was not run during implementation.

Production startup stops on missing/mismatched required unique registry indexes. Development/test reports the state but never repairs it. To roll back the application hardening, redeploy the previous server artifact/config; no database rollback is needed because normal startup performs no DDL/DML.
