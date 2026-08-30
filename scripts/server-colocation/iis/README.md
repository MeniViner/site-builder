# Builder Data API IIS/iisnode deployment

This directory defines the only supported IIS boundary for the transitional Builder Data API: a **new, separate IIS site** on a loopback-only binding. It never modifies the existing SiteBuilder HUB site or its application pool.

The intended topology is:

```text
HUB process -> http://127.0.0.1:3001 -> BuilderDataApi IIS site -> iisnode named pipe -> Builder Node entry
```

`web.config.template` must be rendered into `web.config` in the deployed Builder bundle after its `__NODE_ENTRY__` token is replaced with the packaged JavaScript entry point (`app/server/index.js`). The template uses the bundled `runtime\node.exe`; the Node entry must listen on `process.env.PORT || SERVER_PORT`, and iisnode provides `PORT` as a named pipe.

## Safety model

- `Install-BuilderIis.ps1` defaults to a non-mutating dry run. Writes require both `-Apply` and `-Confirm SITEBUILDER_IIS_INSTALL`.
- It rejects non-loopback bindings, an existing site/app pool, missing iisnode, a missing rendered web.config, and a missing Node entry. It creates a dedicated `No Managed Code` application pool only after those checks.
- `Test-BuilderIisHealth.ps1` performs a localhost-only HTTP smoke check and makes no IIS or MongoDB changes.
- `Rollback-BuilderIis.ps1` defaults to a non-mutating dry run. Destructive IIS changes require both `-Apply` and `-Confirm SITEBUILDER_IIS_ROLLBACK`; it removes only the named Builder site and its dedicated unused pool, never deployment files or databases.

Run these scripts only from an elevated Windows PowerShell 5.1 session during an approved server procedure. They intentionally do not create configuration, populate `.env`, install iisnode, install Node, or open a firewall port.
