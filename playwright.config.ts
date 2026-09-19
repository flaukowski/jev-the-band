import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5178',
    browserName: 'chromium',
    launchOptions: {
      args: ['--mute-audio', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
});
