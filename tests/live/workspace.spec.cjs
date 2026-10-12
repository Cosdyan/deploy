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
 await row.getByRole('button',{name:'删除',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click();
 await expect(row).not.toBeVisible();
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

test('port policy survives save, page reload and reopening on mobile', async ({page}) => {
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const login=await page.request.post('/api/token',{form:{username:'admin@example.invalid',password:'ci_test_password_123'}});
 expect(login.ok()).toBeTruthy(); const {access_token}=await login.json();
 const gql=async(query,variables={})=>{
  const response=await page.request.post('/api/graphql',{headers:{Authorization:'Bearer '+access_token},data:{query,variables}});
  expect(response.ok()).toBeTruthy(); const result=await response.json(); expect(result.errors).toBeUndefined(); return result.data;
 };
 const servers=await gql('{servers{id name}}');
 const sid=servers.servers.find(s=>s.name==='CI SSH target').id;
 await gql('mutation($s:Int!){addPort(serverId:$s,num:18087)}',{s:sid});
 const pid=(await gql('query($s:Int!){port(serverId:$s,num:18087){id}}',{s:sid})).port.id;
 await page.addInitScript(token=>{localStorage.setItem('i18nextLng','zh');localStorage.setItem('auth',JSON.stringify({token,permissions:{is_superuser:true}}));},access_token);
 const openPolicy=async()=>{
  await page.getByRole('button',{name:'端口 18087 操作',exact:true}).click();
  await page.getByRole('button',{name:/限制端口|端口限制|Restrict Port/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
 };
 try {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/app/servers/'+sid+'/ports');
  await openPolicy(); const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('流量配额（GiB，0 表示不限）')).toHaveValue('0');
  await dialog.getByLabel('到期时间',{exact:true}).fill('2028-01-01T12:30');
  await dialog.getByLabel('到期后操作',{exact:true}).selectOption('3');
  await dialog.getByLabel('流量配额（GiB，0 表示不限）').fill('2.5');
  await dialog.getByLabel('配额用尽后操作',{exact:true}).selectOption('8');
  await dialog.getByRole('button',{name:'保存策略',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('策略已保存');
  const saved=(await gql('query($id:Int!){port(id:$id){config}}',{id:pid})).port.config;
  expect(saved.quota).toBe(2684354560); expect(saved.due_action).toBe(3); expect(saved.quota_action).toBe(8);
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await page.reload(); await openPolicy();
  await expect(dialog.getByLabel('到期时间',{exact:true})).toHaveValue('2028-01-01T12:30');
  await expect(dialog.getByLabel('到期后操作',{exact:true})).toHaveValue('3');
  await expect(dialog.getByLabel('流量配额（GiB，0 表示不限）')).toHaveValue('2.5');
  await expect(dialog.getByLabel('配额用尽后操作',{exact:true})).toHaveValue('8');
  expect(errors).toEqual([]);
 } finally {await gql('mutation($id:Int!){deletePort(id:$id)}',{id:pid});}
});
