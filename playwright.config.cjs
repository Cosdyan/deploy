const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/frontend',
  timeout: 30000,
  use: { browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm --prefix source run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/login',
    timeout: 30000
  }
});
