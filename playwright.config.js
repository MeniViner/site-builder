import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser acceptance harness for the site-builder SPA.
 *
 * The app is booted standalone through Vite's `kashar-demo` mode. That mode is
 * the least invasive way to reach the admin UI without SharePoint or Mongo:
 * `VITE_DEMO_PROFILE=kashar` (see .env.kashar-demo) makes the runtime config
 * fall back to the development descriptor (storageBackend "txt", no SharePoint
 * identity) and the demo profile seeds a local, browser-persisted data set.
 *
 * Port 5199 is used deliberately so a developer's own `npm run dev:vite`
 * (5173) is never disturbed.
 */
const PORT = 5199;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: [['list']],
    // 49 specs share one Vite dev server in a single worker. A 10s expect
    // budget was marginal for the reload/hydration waits once the run was under
    // load: specs passed alone and failed in the batch. Raising the budget does
    // not hide a failure -- a genuinely broken expectation still exhausts it --
    // it just stops a slow-but-correct wait from being reported as a defect.
    timeout: 90_000,
    expect: { timeout: 20_000 },
    use: {
        baseURL: `http://localhost:${PORT}`,
        headless: true,
        trace: 'retain-on-failure',
        locale: 'he-IL',
        viewport: { width: 1440, height: 900 },
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: `npx vite --mode kashar-demo --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
