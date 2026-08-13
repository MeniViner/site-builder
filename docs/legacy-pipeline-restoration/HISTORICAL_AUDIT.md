# Legacy pipeline historical audit

Baseline: local commit `a64d2e9` (`Publish latest site builder updates`, 2026-07-01).

This is the last local revision before commit `70f4c94` introduced the production build wrapper, runtime-selector artifacts, and shared deployment helpers. At `a64d2e9`, both existing-site and missing-library branches are present in `postbuild.js`, `init-sharepoint-site.js`, and `AdminSharePointSetupPage.jsx`. Repository history contains code/documentation evidence, not archived real-machine execution logs; the real Windows acceptance remains authoritative.

| File | Baseline behavior | Divergence after baseline | Scope | Regression assessment |
|---|---|---|---|---|
| `package.json` | `vite build` + historical postbuild | Shared build wrapper and later dual modes | Both | Shared canonical output allowed cross-mode contamination |
| `deploy.js` | Created the deep destination with recursive Node `mkdir`, then copied `dist` directly to it | Runtime staging and later atomic verification changed the transport; the first restoration removed `mkdir` and expected robocopy to create the complete deep UNC destination | Legacy | Real Windows proved both approaches unsafe: deep Node `mkdir` is unreliable and robocopy returns `ERROR 53` when its destination starts below nonexistent WebDAV children |
| `scripts/postbuild.js` | Checks libraries, finalizes existing or uploads bootstrap | Runtime artifact generation and extra deployment opt-in | Legacy | Changed normal terminal semantics |
| `scripts/init-sharepoint-site.js` | Library check; preserves non-empty TXT files | Blob is unchanged from baseline | Legacy | Not implicated |
| `scripts/sp-env.js` | Resolves `.env.production`, bootstrap and final paths | Storage/runtime descriptor fields added | Both | Path result remained stable; not the `UNKNOWN mkdir` cause |
| `scripts/build-production.mjs` | Absent | Added shared Legacy/Universal lifecycle | Both | Coupled mutable output and Windows filesystem behavior |
| `scripts/buildLifecycle.mjs` | Absent | Added staged canonical promotion | Universal candidate | Must not govern Legacy |
| `scripts/deploymentArtifacts.mjs` | Absent | Shared runtime overlays/manifests | Both | Coupled Legacy to Universal contracts |
| `AdminSharePointSetupPage.jsx` | Creates libraries/data and copies bootstrap files | Strict byte/hash preflight and index-last copy | Legacy bootstrap | Retained because it preserves the historical flow and prevents mixed assets; awaits Windows/browser acceptance |
| `runtimeConfig.js` | Runtime JSON optional; Vite env fallback | Universal strict mode added | Both | Must stay mode-gated so Legacy needs no JSON |
| `storageBackend.js` | Build-time storage identity | Runtime descriptor/security validation added | Both | Bootstrap-root exception must remain narrowly scoped |
| `sharepointRuntimeDescriptor.js` | Absent | Canonical identity/security model added | Both | Retained for runtime protection; not used by Legacy WebDAV transport |
| `main.jsx` | Loads optional runtime config then renders | Mode-aware fail-closed Universal startup | Both | Correct only while Legacy remains compiled-env mode |
| `vite.config.js` | Normal Vite output | Browser file-system headers changed | Development | Unrelated to deployment regression |

Restoration decision:

- Legacy owns `dist`, `.env.production`, historical postbuild routing, and Legacy-only deployment/manifest files.
- Universal owns `.tmp-build/universal` and `dist-universal`, and cannot invoke Legacy postbuild.
- The semantic change responsible for the current `ERROR 53` was removal of the historical destination pre-creation without changing robocopy's destination from the deep `SiteAssets/<bootstrapFolder>/dist` path to an existing ancestor. Robocopy was therefore asked to open a network path whose intermediate WebDAV children did not exist.
- Bootstrap transport now preflights only the existing `/sites/<site>/<bootstrapLibrary>` anchor, copies a local `<bootstrapFolder>/dist` staging tree into that anchor to establish children, mirrors the current `dist`, verifies the Legacy manifest, and commits `index.html` last.
- Node `fs.mkdirSync` is used only for local `.tmp-deploy` staging. It is never used to create SharePoint WebDAV directories.
- Existing non-empty TXT data remains protected by `init-sharepoint-site.js`.
