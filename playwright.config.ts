import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:5178',
    browserName: 'chromium',
    launchOptions: {
      args: ['--mute-audio', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
    },
    screenshot: 'only-on-failure',
    // The stage is a constantly changing full-canvas scene; trace screencasts of it cost more than
    // the test itself. Actions, DOM snapshots and failure screenshots are still kept.
    trace: { mode: 'retain-on-failure', screenshots: false },
  },
  reporter: 'list',
});
