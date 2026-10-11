const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
 testDir: '.', testMatch: '*.spec.cjs', timeout: 60000, workers: 1,
 use: {baseURL:'http://127.0.0.1:8000', screenshot:'only-on-failure', trace:'retain-on-failure'},
 reporter: [['list'],['html',{outputFolder:'live-report',open:'never'}]]
});
