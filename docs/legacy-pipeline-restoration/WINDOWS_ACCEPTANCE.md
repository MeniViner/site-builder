# Windows acceptance checklist

Run this only on the closed Windows machine with normal SharePoint/WebDAV access. Do not manually upload or edit SharePoint files between scenarios. Preserve the complete terminal output from every command.

## 1. Existing TXT site

1. Point `.env.production` at a known existing TXT site and confirm `VITE_AUTO_DEPLOY=true`.
2. Run `npm run build`.
3. Confirm `LIBRARIES: READY`, `DEPLOY MODE: FINAL`, final robocopy succeeds, and no setup URL is required.
4. Open the final URL and confirm the application loads.
5. Verify existing config, users, widgets, events, theme, Gantt, external links, and other TXT content remain unchanged.

## 2. Brand-new TXT site

1. Point `.env.production` at a new site whose configured data libraries do not exist.
2. Before the build, open or otherwise test only `\\<host>@SSL\DavWWWRoot\sites\<site>\<bootstrapLibrary>`. Record whether this existing library anchor is reachable; do not test the nonexistent `<bootstrapFolder>\dist` child.
3. Run `npm run build`.
4. Confirm `LIBRARIES: MISSING`, `DEPLOY MODE: BOOTSTRAP`, and the exact target is `/sites/<site>/<bootstrapLibrary>/<bootstrapFolder>/dist`.
5. Confirm the log reports host, site code, bootstrap library, anchor server-relative path, anchor UNC path, and `WebDAV transport probe: robocopy against the existing library anchor`. There must be no Node filesystem reachability gate.
6. Confirm the first robocopy targets the existing library anchor, the second mirrors the current staged `dist` into the established deep target, and `index.html` is copied last.
7. Require `BOOTSTRAP_UPLOAD: SUCCESS`, `BOOTSTRAP_VERIFY: SUCCESS`, `BOOTSTRAP TRANSPORT READY`, and a printed setup URL. There must be no `ERROR 53`.
8. Open the setup URL. Confirm `BOOTSTRAP_PAGE_LOAD: SUCCESS`, with the canonical site root and bootstrap physical root reported separately.
9. Run setup and require, in order: `SHAREPOINT_CONTEXTINFO`, `CREATE_LIBRARIES`, `CREATE_FOLDERS`, `CREATE_TXT_SEEDS`, `FINAL_ASSET_COPY`, `FINAL_ASSET_VERIFY`, `FINAL_INDEX_COMMIT`, `FINAL_INDEX_VERIFY`, `FINAL_APP_SMOKE`, and `COMPLETE`.
10. Confirm nested manifest folders such as `images/kashar-demo` exist before their files are uploaded.
11. Confirm the seed summary reports created/preserved/failed and that no existing non-empty TXT data changed.
12. Confirm `FINAL_APP_SMOKE: STATIC PASS`, `LEGACY PIPELINE: COMPLETE`, and the final URL are printed.
13. In Explorer, compare final `index.html` and its primary hashed JS/CSS filenames to local `dist`.

Robocopy against the existing library anchor is the authoritative WebDAV transport test. If it fails, preserve the normalized failure boundary, operation, source, target, exit code, stdout/stderr, and build ID. Do not infer reachability from Node `fs.existsSync()` and do not report success from local mocks.

## 3. Update the newly created site

1. Without manually touching SharePoint files, run `npm run build` again using the same `.env.production`.
2. Confirm `LIBRARIES: READY`, `DEPLOY MODE: FINAL`, and bootstrap mode is not used.
3. Confirm the final application loads and all data created in scenario 2 is preserved.

## 4. Universal Release Manager artifact

1. Run `npm run build:universal`.
2. Confirm there is no library check, SharePoint/WebDAV access, or Legacy postbuild output.
3. Confirm the artifact is generated under `dist-universal` and Legacy `dist` remains unchanged.
4. Run `npm run verify:universal-dist` and require `PASS`.

Send the four terminal logs back for analysis. Until all four scenarios pass, status remains `WAITING FOR WINDOWS ACCEPTANCE`.
