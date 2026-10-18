const { test, expect } = require('@playwright/test');

for (const sshPort of ['', '1', '22', '7118', '65535']) {
for (const withKey of [false, true]) {
  test('add server dialog works and submits valid SSH key data: ' + withKey + ', SSH port: ' + (sshPort || 'default'), async ({ page }) => {
    const errors = [];
    const submissions = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en');
      localStorage.setItem('auth', JSON.stringify({
        token: 'isolated-test-token',
        permissions: { is_superuser: true, user_id: 1 }
      }));
    });
    await page.routeWebSocket('**/api/graphql', ws => {
      ws.onMessage(message => {
        const data = JSON.parse(String(message));
        if (data.type === 'connection_init') ws.send(JSON.stringify({ type: 'connection_ack' }));
      });
    });
    await page.route('**/api/graphql', async route => {
      const body = route.request().postDataJSON();
      let data;
      if (body.query.includes('GetServers')) {
        data = { paginatedServers: { items: [], count: 0 } };
      } else if (body.query.includes('GetSecrets')) {
        data = { files: withKey ? [{
          id: 7, name: 'Test key', version: '1',
          createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
        }] : [] };
      } else if (body.query.includes('AddServer')) {
        submissions.push(body.variables);
        data = { addServer: true };
      } else {
        throw new Error('Unexpected query: ' + body.query);
      }
      await route.fulfill({ json: { data } });
    });
    await page.goto('http://127.0.0.1:4173/app/servers');
    await page.getByRole('button', { name: 'Add Server', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add Server' })).toBeVisible();
    await expect(dialog.getByRole('combobox')).toHaveText('No SSH Key');
    if (withKey) {
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: 'Test key' }).click();
      await expect(dialog.getByRole('combobox')).toHaveText('Test key');
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: 'No SSH Key' }).click();
      await expect(dialog.getByRole('combobox')).toHaveText('No SSH Key');
    }
    await dialog.locator('input[type="text"]').first().fill('Validation server');
    await dialog.getByPlaceholder('www.example.com').fill('example.invalid');
    const portInput = dialog.locator('input[type="number"]');
    for (const invalidPort of ['0', '-1', '65536', '1.5']) {
      await portInput.fill(invalidPort);
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText('SSH port must be between 1 and 65535');
      expect(submissions).toHaveLength(0);
    }
    await portInput.fill(sshPort);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).not.toHaveProperty('keyFileId');
    if (sshPort) expect(submissions[0].port).toBe(Number(sshPort));
    else expect(submissions[0]).not.toHaveProperty('port');
    expect(errors).toEqual([]);
    // Reopen after submission, choose a real key, and ensure the API receives its numeric ID.
    await page.getByRole('button', { name: 'Add Server', exact: true }).first().click();
    await expect(dialog.getByRole('heading', { name: 'Add Server' })).toBeVisible();
    if (withKey) {
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: 'Test key' }).click();
      await dialog.locator('input[type="text"]').first().fill('Validation server with key');
      await dialog.getByPlaceholder('www.example.com').fill('example.invalid');
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(submissions[1].keyFileId).toBe(7);
    } else {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
}
