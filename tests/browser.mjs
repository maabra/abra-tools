import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
await fs.mkdir('artifacts',{recursive:true});
try {
 for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto('http://localhost:3000');assert.equal(response.status(),200);
  await page.getByRole('heading',{name:'What are we fixing today?'}).waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`artifacts/${name}.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  for(const name of ['PDF playground','Video squeeze','Actually a GIF','Image squish']) {
   await page.getByRole('button').filter({has:page.getByRole('heading',{name,exact:true})}).click();
   await page.locator('#workbench').waitFor();
   await page.getByRole('button',{name:'Close tool'}).click();
  }
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Image squish',exact:true})}).click();
  await page.locator('input[type=file]').first().setInputFiles({name:'test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>')});
  await page.getByRole('button',{name:'Squish my images'}).click();
  await page.getByRole('heading',{name:'A little lighter. All yours.'}).waitFor({timeout:20000});
  assert.equal(await page.locator('.result-row').count(),1);
  assert.deepEqual(errors,[]);await page.screenshot({path:`artifacts/${name}-result.png`,fullPage:true});
  console.log(`PASS ${name}: layouts, all tool panels, real image upload and result`);await page.close();
 }
}finally{await browser.close();}
