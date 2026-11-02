import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PDFDocument,rgb} from 'pdf-lib';
import sharp from 'sharp';
import {unzipSync} from 'fflate';

// Static-only hosting deliberately has no backend or /api implementation.
const root=path.resolve('dist');
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root+path.sep))throw Error('Invalid path');
    const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'};
    res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');
    res.end(await fs.readFile(filename));
  }catch {res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const doc=await PDFDocument.create();doc.addPage([200,200]).drawRectangle({x:20,y:20,width:160,height:160,color:rgb(0.9,0.3,0.2)});doc.addPage([300,300]).drawRectangle({x:30,y:30,width:220,height:220,color:rgb(0.2,0.6,0.8)});
const pdf=Buffer.from(await doc.save());
const other=await PDFDocument.create();other.addPage([400,200]).drawRectangle({x:20,y:20,width:360,height:160,color:rgb(0.3,0.8,0.4)});
const otherPdf={name:'other.pdf',mimeType:'application/pdf',buffer:Buffer.from(await other.save())};
const png=await sharp({create:{width:500,height:400,channels:4,background:'#aabbcc88'}}).png().toBuffer();
const imageFile={name:'photo.png',mimeType:'image/png',buffer:png};
const pdfFile={name:'sample.pdf',mimeType:'application/pdf',buffer:pdf};
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'doodle-folder-'));
await fs.mkdir(path.join(folder,'nested'));
await fs.writeFile(path.join(folder,'photo.png'),png);
await fs.writeFile(path.join(folder,'nested','photo.png'),png);
const largePng=await sharp({create:{width:3000,height:2000,channels:4,background:'#aabbcc88'}}).png().toBuffer();
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
    page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource'))errors.push(message.text());});
    await page.route('**/api/**',route=>{api.push(route.request().url());route.abort();});
    await page.goto(base);
    await open(page,'PDF playground');
    await page.locator('input[type=file]').first().setInputFiles([pdfFile,otherPdf]);
    await page.locator('.pdf-page-card').nth(2).waitFor({timeout:30000});
    await page.getByRole('button',{name:'Save organized PDF'}).waitFor();
    for(let index=0;index<3;index++){
      await page.locator('.pdf-page-card').nth(index).scrollIntoViewIfNeeded();
      await page.waitForFunction(i=>{const card=document.querySelectorAll('.pdf-page-card')[i],c=card?.querySelector('canvas');return c?.width>1&&c?.height>1&&!card.querySelector('.preview-status');},index);
    }
    if(width===1440)await page.locator('.pdf-page-card').first().dragTo(page.locator('.pdf-page-card').nth(2));
    else {await page.getByRole('button',{name:'Move page at position 1 right',exact:true}).click();await page.getByRole('button',{name:'Move page at position 2 right',exact:true}).click();}
    assert.match(await page.locator('.pdf-page-card').first().innerText(),/Source page 2/);
    await page.getByRole('button',{name:'Rotate page at position 2',exact:true}).click();
    await page.getByRole('checkbox',{name:'Keep sample.pdf page 1',exact:true}).uncheck();
    await page.getByRole('button',{name:'Remove page at position 1',exact:true}).click();
    assert.equal(await page.locator('.pdf-page-card').count(),2);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    assert.equal(await page.locator('.pdf-page-card').count(),3);
    await page.getByRole('button',{name:'Preview other.pdf page 1',exact:true}).click();
    await page.locator('dialog[open]').waitFor();
    await page.getByRole('button',{name:'Close page preview'}).click();
    await fs.mkdir('artifacts',{recursive:true});
    await page.locator('.pdf-organizer').screenshot({path:`artifacts/pdf-organizer-${width}.png`});
    await run(page);
    const organized=await PDFDocument.load(await download(page,page.locator('.result-row a').first()));
    assert.deepEqual(organized.getPages().map(p=>p.getWidth()),[300,400]);
    assert.deepEqual(organized.getPages().map(p=>p.getRotation().angle),[0,90]);
    await page.getByRole('button',{name:'Uncheck all',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Save organized PDF'}).isDisabled(),true);
    assert.equal(await page.locator('.results').count(),0);
    await page.getByRole('button',{name:'Reset pages',exact:true}).click();
    assert.match(await page.locator('.pdf-page-card').first().innerText(),/Source page 1/);
    await page.locator('input[type=file]').first().setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a valid PDF')});
    await page.locator('.pdf-organizer .alert').waitFor();
    assert.match(await page.locator('.pdf-organizer .alert').innerText(),/broken.pdf/);
    assert.equal(await page.locator('.pdf-page-card').count(),3);
    // Removing an input changes its file index; export must still refer to the correct remaining PDF.
    await page.getByRole('button',{name:'Remove file',exact:true}).first().click();
    try{await page.waitForFunction(()=>document.querySelectorAll('.pdf-page-card').length===1,{},{timeout:10000});}
    catch(e){console.log({errors,files:await page.locator('.file-row').allTextContents(),organizer:await page.locator('.pdf-organizer').innerText()});throw e;}
    await run(page);
    const remaining=await PDFDocument.load(await download(page,page.locator('.result-row a').first()));
    assert.equal(remaining.getPageCount(),1);assert.equal(remaining.getPages()[0].getWidth(),400);
    console.log(`PASS ${width}px: real PDF thumbnails, page reorder/rotation/selection, undo/reset, zoom and matching vector export`);
    await open(page,'PDF playground');
    await page.getByText('Merge PDFs',{exact:true}).click();
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
    await open(page,'Image squish');
    await page.locator('input[webkitdirectory]').setInputFiles(folder);
    await run(page);assert.equal(await page.locator('.result-row').count(),2);
    const folderZip=unzipSync(await download(page,page.getByRole('link',{name:'Download ZIP'})));
    assert.deepEqual(Object.keys(folderZip),['1-photo.webp','2-photo.webp']);
    await open(page,'Image squish');
    await page.locator('select').first().selectOption('avif');
    await page.locator('input[type=file]').first().setInputFiles([
      {name:'large.png',mimeType:'image/png',buffer:largePng},
      {name:'another.png',mimeType:'image/png',buffer:largePng},
    ]);
    await page.locator('button[type=submit]').click();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.match(await page.locator('.alert').innerText(),/cancelled/);
    assert.equal(await page.locator('.results').count(),0);
    // Immediately run another job to verify a cancelled worker cannot overwrite it.
    await page.locator('select').first().selectOption('webp');await run(page);
    assert.equal(await page.locator('.result-row').count(),2);
    console.log(`PASS ${width}px: folder selection, duplicate filenames, cancellation and immediate restart`);
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
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(folder,{recursive:true,force:true});}
