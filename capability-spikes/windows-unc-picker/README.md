# Windows UNC picker capability spike

This isolated, read-only spike is the mandatory Hard Gate 0 for replacing the
Site Builder file-explorer server bridge. It intentionally does not integrate
with the React application and does not browse files through Node, IIS, an API,
or `fetch()`.

## Run it on the real managed Windows workstation

Prerequisites:

- Current organization-managed Google Chrome.
- Access to the real network shares used by the pilot.
- The repository and its existing development dependencies available on the
  Windows workstation.

From the repository root:

```powershell
npm run dev:vite
```

Open this exact page in Chrome:

```text
http://localhost:5173/capability-spikes/windows-unc-picker/
```

`localhost` is treated as a trustworthy origin by Chrome. Do not open the HTML
file directly from disk. If the organization requires a deployed origin, serve
the same unchanged folder over HTTPS.

## Required pilot procedure

1. Record the exact Windows and Chrome versions.
2. Enter the UNC path being tested for evidence only. The page cannot verify an
   absolute path because Chrome does not expose it through a directory handle.
3. Mark the characteristics covered by the run.
4. Click **בחר ובדוק תיקיית רשת**.
5. In Chrome's native folder picker, confirm whether **Network** locations are
   visible. Browse to the intended share and select the folder.
6. Confirm that all technical checks through IndexedDB and `queryPermission()`
   pass.
7. Click **רענן ואמת שמירה**. Confirm the handle is retrieved after reload.
8. If the permission is `prompt`, click **בקש מחדש הרשאת קריאה**. This invokes
   `requestPermission({ mode: "read" })` from that button gesture.
9. Close every tab for this origin, open the page again, and record whether the
   handle survived and whether permission is `granted`, `prompt`, or failed.
10. Record whether Chrome offered persistent access such as “Allow on every
    visit” and whether managed policy changed or blocked the flow.
11. Repeat as necessary to cover:
    - one UNC share addressed by hostname;
    - a path containing spaces;
    - a path containing Hebrew;
    - a nested child directory.
12. Save screenshots of the first connection and returning connection outside
    this source folder, then click **הורד דוח בדיקה**.

One selected path may cover several characteristics, but the report must contain
at least one successful run for every characteristic.

## What the automated spike proves

On each successful run the page:

1. Calls `window.showDirectoryPicker({ mode: "read" })` directly from a button
   click.
2. Enumerates the selected folder with `for await (const entry of
   handle.values())`.
3. Opens a child using `getDirectoryHandle(name, { create: false })` when a
   child directory exists. A folder without a child is recorded as
   `not_applicable` and does not fail the gate.
4. Finds a file within a bounded depth and reads metadata using `getFile()` when
   a file exists. A folder without a readable file is recorded as
   `not_applicable` and does not fail the gate.
5. Stores the `FileSystemDirectoryHandle` in IndexedDB.
6. Retrieves it after reload and calls `queryPermission({ mode: "read" })`.
7. Provides a separate user-gesture button for
   `requestPermission({ mode: "read" })` when needed.

The spike reads names and metadata only. It never reads file contents and never
requests write access.

## Gate decision

- **PASS candidate** still requires the exported report and screenshots to be
  reviewed by the operator. The page cannot independently prove that a selected
  directory was a UNC share or inspect managed Chrome policy.
- **BLOCKED** means the production implementation must not begin. Record the
  exact native picker, permission, or policy limitation and stop.

Do not fall back to the prior Node/IIS/API architecture or another client
installation when the pilot is blocked.

## Primary Chrome references

- [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [Persistent permissions for the File System Access API](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
