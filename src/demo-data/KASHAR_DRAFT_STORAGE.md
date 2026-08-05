# Kashar local draft storage and recovery

Kashar is intentionally isolated from normal Site Builder persistence. Normal
sites continue to use their configured repository; only the Kashar profile uses
the local draft namespace below.

## Canonical record

The only active key is:

```text
site-builder:demo:kashar:draft:v1
```

`KasharDraftStore` is the sole serializer and writer for that key. It stores a
single JSON value with this stable discriminator:

```json
{
  "format": "site-builder-kashar-draft",
  "demoProfile": "kashar",
  "demoSeedVersion": 1,
  "demoSchemaVersion": 1,
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "revision": 1,
  "configEnvelope": {},
  "gantt": {},
  "sharedWidgetConfig": {},
  "migration": null
}
```

Config changes, navigation, managed links, organization data, galleries,
legacy widgets, shared polls, and Gantt changes each submit their domain value
to the store. The store reloads the latest complete record, patches that one
branch, increments `revision`, serializes once, and verifies the read-back.
The in-page write queue prevents an older queued write from finishing after a
newer one.

## Local image assets

The draft stores only stable `kashar-asset:<id>` references for images that a
Kashar user uploads. `KasharAssetStore` owns their bytes in the separate
browser IndexedDB database `site-builder-kashar-assets-v1`; images from the
fixture remain repository paths and are never copied there. Each user asset
has its identifier, original filename, MIME type, size, timestamps, optional
dimensions and checksum, upload category, a Blob, and an encoded binary
fallback for portable browser IndexedDB implementations.

The shared upload boundary selects this store only in the Kashar profile. It
validates bytes against the supported PNG, JPEG, GIF, WebP, AVIF, and safe SVG
formats before returning a stable reference. An unavailable or full IndexedDB
operation is an upload failure: no successful result is reported and no HTTP
upload is attempted. Non-Kashar sites continue through their unchanged upload
path and configured storage backend.

Rendering resolves a Kashar reference back to a temporary object URL only in
the Kashar profile. Object URLs are reference-counted and revoked when their
last consumer unmounts, the asset is removed, or reset/import replaces the
asset set. Object URLs are never saved in the draft.

When a config revision is committed, cleanup considers only references removed
by that committed revision. This deliberately preserves a just-uploaded asset
until the UI persists its reference, and only then removes an old replacement
or deletion target if no longer referenced anywhere in the draft.

## Seeding, migration, and backups

`kasharDemoData.js` is used only when the active key is missing and for an
explicit reset. A later fixture or `demoSeedVersion` change never replaces an
existing record.

`decodeKasharDraft` is shared by startup, import, and diagnostics. It supports:

- the canonical record;
- the earlier `draftFormat: "site-builder:kashar-draft"` wrapper;
- a previous wrapper with no discriminator;
- positively recognizable Kashar config-envelope or fixture-shaped data;
- supported legacy metadata names (`profile`, `seedVersion`); and
- a value JSON-serialized twice.

Recognition requires Kashar-specific configuration structure and asset
provenance; arbitrary Builder envelopes are rejected. A recoverable legacy
value is copied unchanged to an immutable sibling
`site-builder:demo:kashar:draft:v1:backup:migration:<hash>` before the canonical
record is written. The canonical record then records its migration source and a
non-blocking upgrade notice is shown.

Invalid data is never silently reseeded. The exact raw value is preserved at
`...:backup:invalid:<hash>`; the fingerprinted key deduplicates repeated loads
of the same corruption. Reset and import make additional timestamped
`pre-reset` or `pre-import` backups for readable drafts and never delete
forensic invalid backups.

## Development recovery

If startup cannot load a Kashar record, the blocking startup screen (before
Admin Hub and normal config context are available) shows a development-only
Kashar recovery panel. It lists namespaced key diagnostics without showing raw
content: key, byte size, JSON result, type, top-level keys, and decoder result.
It can download a raw diagnostic bundle, import a validated draft, reset after
confirmation, refresh diagnostics, or retry startup. The panel is not rendered
for normal profiles or production builds.

The diagnostic bundle keeps the exact serialized payload in its `raw` field and
is itself accepted by Import, so preservation does not require manually
rewrapping recovered content.

For a valid active record that coexists with an older invalid backup, a
development Kashar build also exposes `window.__KASHAR_DEMO_RECOVERY__` at
bootstrap. Its `inspect()`, `getRaw(key)`, and `exportCurrentDraft()` methods
are read-only; `reset()` and `importDraft(text)` ask for browser confirmation.
It is never installed outside development Kashar mode.

Admin Hub exposes the same confirmed reset and import/export controls after a
valid config loads. Export now emits the self-contained workspace format below;
the historical canonical-draft format remains accepted as a legacy import.

```json
{
  "format": "site-builder-kashar-workspace-export",
  "exportVersion": 1,
  "demoProfile": "kashar",
  "exportedAt": "ISO timestamp",
  "draft": { "format": "site-builder-kashar-draft" },
  "assets": [
    {
      "id": "stable asset id",
      "reference": "kashar-asset:stable asset id",
      "mimeType": "image/png",
      "binaryBase64": "..."
    }
  ]
}
```

Import validates the draft and all image bytes before replacing anything. A
workspace requires an exact match between the draft's Kashar asset references
and bundled image identifiers; the current draft and current assets are backed
up first and restored if either replacement step fails. A legacy draft-only
import is allowed with a visible warning because it cannot include local image
bytes.

**Reset Kashar demo data** is the only operation that reapplies the full
fixture. After confirmation it preserves the draft and associated user asset
records in recovery backups, writes the fixture paths into the canonical draft,
and clears current user-uploaded assets. It never changes another Site Builder
site or the repository-provided asset provenance documented in
[`KASHAR_ASSET_SOURCES.md`](./KASHAR_ASSET_SOURCES.md).
