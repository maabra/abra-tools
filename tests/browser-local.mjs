import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {unzipSync} from 'fflate';

// Static-only hosting deliberately has no backend or /api implementation.
const root=path.resolve('dist');
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root+path.sep))throw Error('Invalid path');
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm'};
    res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');
    res.end(await fs.readFile(filename));
  }catch {res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const doc=await PDFDocument.create();doc.addPage([200,200]);doc.addPage([300,300]);
const pdf=Buffer.from(await doc.save());
const png=await sharp({create:{width:500,height:400,channels:4,background:'#aabbcc88'}}).png().toBuffer();
const imageFile={name:'photo.png',mimeType:'image/png',buffer:png};
const pdfFile={name:'sample.pdf',mimeType:'application/pdf',buffer:pdf};
async function download(page,link){
  const pending=page.waitForEvent('download');await link.click();const d=await pending;
  const filename=await d.path();return await fs.readFile(filename);
}
async function run(page){await page.locator('button[type=submit]').click();await page.locator('.results').waitFor({timeout:60000});}
async function open(page,name){await page.getByRole('button').filter({has:page.getByRole('heading',{name,exact:true})}).click();}
try {
  for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[],api=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',route=>{api.push(route.request().url());route.abort();});
    await page.goto(base);
    await open(page,'PDF playground');
    await page.locator('input[type=file]').first().setInputFiles([pdfFile,{...pdfFile,name:'second.pdf'}]);
    await page.getByRole('button',{name:'Move PDF down'}).first().click();
    await run(page);
    const merged=await download(page,page.locator('.result-row a').first());
    assert.equal((await PDFDocument.load(merged)).getPageCount(),4);
    const zip=unzipSync(await download(page,page.getByRole('link',{name:'Download ZIP'})));
    assert.equal((await PDFDocument.load(zip['merged.pdf'])).getPageCount(),4);
    await open(page,'PDF playground');
    await page.getByText('Extract pages',{exact:true}).click();
    await page.locator('input[type=file]').first().setInputFiles(pdfFile);
    await page.getByPlaceholder('All pages, or e.g. 1-3, 5, 8-10').fill('2,1,2');
    await run(page);
    const extracted=await PDFDocument.load(await download(page,page.locator('.result-row a').first()));
    assert.deepEqual(extracted.getPages().map(p=>p.getWidth()),[300,200,300]);
    await open(page,'PDF playground');
    await page.getByText('Separate pages',{exact:true}).click();
    await page.locator('input[type=file]').first().setInputFiles(pdfFile);
    await page.getByPlaceholder('All pages, or e.g. 1-3, 5, 8-10').fill('2,2');
    await run(page);assert.equal(await page.locator('.result-row').count(),2);
    const separated=unzipSync(await download(page,page.getByRole('link',{name:'Download ZIP'})));
    assert.deepEqual(Object.keys(separated),['1-page-2.pdf','2-page-2.pdf']);
    console.log(`PASS ${width}px: browser PDF merge/extract/split, repeated pages and ZIP`);
    for(const format of ['webp','jpeg','png','avif']) {
      await open(page,'Image squish');
      await page.locator('input[type=file]').first().setInputFiles([imageFile,{name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('broken')}]);
      await page.locator('select').first().selectOption(format);
      await page.locator('input[type=number]').fill('200');
      await run(page);
      assert.equal(await page.locator('.result-row').count(),1);
      assert.match(await page.locator('.warnings').innerText(),/broken.jpg/);
      const bytes=await download(page,page.locator('.result-row a').first());
      const meta=await sharp(bytes).metadata();assert.equal(meta.width,200);
      assert.equal(meta.format,format==='avif'?'heif':format);
      if(format==='jpeg')assert.equal(meta.hasAlpha,false);
      if(format==='avif')assert.equal(meta.compression,'av1');
      const zipped=unzipSync(await download(page,page.getByRole('link',{name:'Download ZIP'})));
      assert.equal(Object.keys(zipped).length,1);assert.deepEqual(Buffer.from(Object.values(zipped)[0]),bytes);
      console.log(`PASS ${width}px: ${format} output bytes, dimensions, per-file error and ZIP`);
    }
    await open(page,'Image squish');
    await page.locator('input[type=file]').first().setInputFiles({name:'drawing.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="red"/></svg>')});
    await run(page);assert.equal(await page.locator('.result-row').count(),1);
    assert.equal((await sharp(await download(page,page.locator('.result-row a').first())).metadata()).width,100);
    await open(page,'PDF playground');
    await page.getByText('Extract pages',{exact:true}).click();
    await page.locator('input[type=file]').first().setInputFiles(pdfFile);
    await page.getByPlaceholder('All pages, or e.g. 1-3, 5, 8-10').fill('99');
    await page.locator('button[type=submit]').click();await page.locator('.alert').waitFor();
    assert.match(await page.locator('.alert').innerText(),/1.+2/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);assert.deepEqual(api,[]);
    console.log(`PASS ${width}px: SVG, invalid PDF ranges, no horizontal overflow and ZERO backend requests`);
    await page.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
