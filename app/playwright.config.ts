import { defineConfig, devices } from '@playwright/test'

// Three profiles matching how she actually plays: iPhone + iPad (touch, WebKit —
// her real devices) and Desktop (mouse/hover, Chromium — for building/reviewing).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
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
      // the player-facing app is what actually needs iPad coverage
      testIgnore: '**/recording-studio.spec.ts',
      use: { ...devices['iPad Pro 11'] },
    },
    {
      name: 'iphone',
      testIgnore: '**/recording-studio.spec.ts',
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
