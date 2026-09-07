import { defineConfig, devices } from '@playwright/test'

// Three profiles matching how she actually plays: iPhone + iPad (touch, WebKit —
// her real devices) and Desktop (mouse/hover, Chromium — for building/reviewing).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  /*
   * Retries on CI only, for a failure mode that is genuinely non-deterministic rather than a
   * broken test: on the ipad/iphone (WebKit) profiles, a ten-card Hardop lezen round
   * occasionally loses the page outright — "Target page, context or browser has been closed"
   * mid-click, not an assertion failure and not a timeout. Two consecutive runs of the same
   * commit range failed on a *different* pair of tests each time, and the two blamed first
   * passed once made lighter, which is the signature of resource contention (two WebKit
   * contexts, a two-core runner, six-minute runs) rather than of any one test.
   *
   * A deterministic break still fails every attempt, so this hides nothing. It is not a root
   * cause either — see the "ten <audio> elements per round on WebKit" entry in
   * docs/code-review-backlog.md for the hypothesis that needs a real device to confirm.
   */
  retries: process.env.CI ? 2 : 0,
  // 'list' for a readable local/CI log; 'html' so a CI failure has a report worth uploading
  // as an artifact (never auto-opens a browser — that would hang a headless run).
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
    {
      name: 'ipad',
      // dev-only recording studio needs Chromium's fake-media flags + File System Access API;
      // the player-facing app is what actually needs iPad coverage.
      // pointer-isolation simulates real multi-touch via CDP's Input.dispatchTouchEvent,
      // which only exists in Chromium (newCDPSession throws immediately on WebKit) — the
      // pointerId-isolation logic it exercises is plain React/DOM event handling with no
      // engine-specific behaviour, so Chromium-only coverage is a test-tooling limitation,
      // not a gap in coverage of what actually differs on her real device.
      testIgnore: ['**/recording-studio.spec.ts', '**/pointer-isolation.spec.ts'],
      use: { ...devices['iPad Pro 11'] },
    },
    {
      name: 'iphone',
      testIgnore: ['**/recording-studio.spec.ts', '**/pointer-isolation.spec.ts'],
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
