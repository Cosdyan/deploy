const { test, expect } = require('@playwright/test');
test('real deployed workspace: user CRUD, server modal, pages and mobile layout', async ({page}) => {
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const response=await page.request.post('/api/token',{form:{username:'admin@example.invalid',password:'ci_test_password_123'}});
 expect(response.ok()).toBeTruthy(); const {access_token}=await response.json();
 await page.addInitScript(token=>{localStorage.setItem('i18nextLng','zh'); localStorage.setItem('auth',JSON.stringify({token,permissions:{is_superuser:true}}));},access_token);
 await page.goto('/app/users');
 await expect(page.getByRole('heading',{name:'用户管理'})).toBeVisible();
 await page.getByRole('button',{name:'添加用户',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('邮箱',{exact:true}).fill('ui@example.invalid');
 await dialog.getByLabel('密码',{exact:true}).fill('ci_test_password_123');
 await dialog.getByLabel('备注',{exact:true}).fill('UI account');
 await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 const row=page.getByRole('row').filter({hasText:'ui@example.invalid'});
 await expect(row).toBeVisible();
 await row.getByRole('button',{name:'编辑',exact:true}).click();
 await dialog.getByLabel('备注',{exact:true}).fill('Edited by UI');
 await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await expect(row).toContainText('Edited by UI');
 await page.getByLabel('搜索邮箱').fill('ui@example.invalid');
 await expect(page.getByText('共 1 位用户')).toBeVisible();
 await page.getByLabel('搜索邮箱').fill('');
 await page.goto('/app/servers');
 await expect(page.getByText('已登记服务器',{exact:true})).toBeVisible();
 // Access the server modal through the translated accessible header button.
 await page.getByRole('button',{name:'添加服务器',exact:true}).first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'添加',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('请填写');
 await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
 for(const path of ['/app/files','/app/services','/app/about']) {await page.goto(path); await expect(page.locator('main')).not.toBeEmpty();}
 await page.setViewportSize({width:390,height:844}); await page.goto('/app/servers');
 await page.getByRole('button',{name:'打开导航菜单'}).click();
 await expect(page.getByRole('navigation',{name:'主导航'}).last()).toBeVisible();
 await page.screenshot({path:'live-report/mobile.png',fullPage:true});
 expect(errors).toEqual([]);
});
