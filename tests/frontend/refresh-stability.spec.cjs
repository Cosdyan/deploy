const {test,expect}=require('@playwright/test');
test('user rows remain visible during a delayed refresh after save',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');localStorage.setItem('auth',JSON.stringify({token:'isolated-test-token',permissions:{is_superuser:true,user_id:1}}));});
 await page.routeWebSocket('**/api/graphql',ws=>ws.onMessage(message=>{if(JSON.parse(String(message)).type==='connection_init')ws.send(JSON.stringify({type:'connection_ack'}));}));
 let releaseRefresh, refreshStarted;
 const started=new Promise(resolve=>refreshStarted=resolve);
 const release=new Promise(resolve=>releaseRefresh=resolve);
 let created=false;
 await page.route('**/api/graphql',async route=>{
  const body=route.request().postDataJSON(); let data;
  if(body.query.includes('CreateManagedUser')){created=true;data={createUser:{id:3}};}
  else if(body.query.includes('ManageUsers')){
   if(created){refreshStarted();await release;}
   data={paginatedUsers:{count:1,items:[{id:2,email:'retained@example.invalid',notes:'Existing row',isActive:true,isOps:false,isSuperuser:false}]}};
  }else throw Error('Unexpected query: '+body.query);
  await route.fulfill({json:{data}});
 });
 await page.goto('http://127.0.0.1:4173/app/users');
 const row=page.getByRole('row').filter({hasText:'retained@example.invalid'});
 await expect(row).toBeVisible();
 await page.getByRole('button',{name:'添加用户',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('邮箱',{exact:true}).fill('new@example.invalid');
 await dialog.getByLabel('密码',{exact:true}).fill('isolated-test-password');
 await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await started;
 try{
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('[aria-busy="true"]').filter({has:row})).toBeVisible();
  await expect(row).toBeVisible();
  await expect(page.getByLabel('搜索邮箱')).toBeVisible();
 }finally{releaseRefresh();}
 await expect(page.locator('[aria-busy="false"]').filter({has:row})).toBeVisible();
 await expect(row).toBeVisible();
});
