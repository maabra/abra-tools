import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gif-metadata-test-'));
const fixture=path.join(dir,'source.mp4');
await new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=12','-t','2.5','-c:v','libx264','-pix_fmt','yuv420p',fixture],{windowsHide:true});
  child.on('error',reject);child.on('exit',code=>code?reject(Error('Fixture failed')):resolve());
});
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[],submissions=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{if(req.method()==='POST'&&new URL(req.url()).pathname==='/api/jobs')submissions.push(req.postDataBuffer()?.toString()||'');});
    await page.goto('http://localhost:3000');
    await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Actually a GIF',exact:true})}).click();
    await page.locator('input[type=file]').first().setInputFiles(fixture);
    await page.getByText('Source detected',{exact:true}).waitFor({timeout:20000});
    assert.equal(await page.getByLabel('Duration (seconds)',{exact:true}).inputValue(),'2.5');
    assert.equal(await page.getByLabel('Width (pixels)',{exact:true}).inputValue(),'160');
    assert.equal(await page.getByLabel('Frames per second',{exact:true}).inputValue(),'12');
    assert.match(await page.locator('.gif-source').innerText(),/160 × 120 px/);
    await page.getByLabel('Duration (seconds)',{exact:true}).fill('1');
    await page.getByLabel('Width (pixels)',{exact:true}).fill('80');
    await page.getByLabel('Frames per second',{exact:true}).fill('8');
    await page.getByRole('button',{name:'Make it a GIF'}).click();
    await page.locator('.results').waitFor({timeout:30000});
    const downloading=page.waitForEvent('download');await page.locator('.result-row a').click();
    const downloaded=await downloading;const meta=await sharp(await fs.readFile(await downloaded.path()),{animated:true}).metadata();
    assert.equal(meta.width,80);assert.equal(meta.pageHeight,60);assert.equal(meta.pages,8);
    assert.equal(submissions.length,2);assert.match(submissions[1],/sourceId/);assert.doesNotMatch(submissions[1],/filename=/);
    await page.getByRole('button',{name:'Use source defaults'}).click();
    assert.equal(await page.getByLabel('Duration (seconds)',{exact:true}).inputValue(),'2.5');
    assert.equal(await page.getByLabel('Width (pixels)',{exact:true}).inputValue(),'160');
    // Exercise the pasted-link UI without depending on X availability or network access.
    await page.getByRole('button',{name:'Clear all'}).click();
    await page.route('**/api/jobs',route=>route.fulfill({json:{id:'mock-linked-source'}}));
    await page.route('**/api/jobs/mock-linked-source',route=>route.fulfill({json:{id:'mock-linked-source',status:'done',metadata:{duration:70,width:1920,height:1080,fps:59.94},results:[],warnings:[]}}));
    await page.locator('#tweet').fill('https://x.com/example/status/123');
    await page.getByText('Source detected',{exact:true}).waitFor({timeout:10000});
    assert.equal(await page.getByLabel('Duration (seconds)',{exact:true}).inputValue(),'60');
    assert.equal(await page.getByLabel('Width (pixels)',{exact:true}).inputValue(),'1280');
    assert.equal(await page.getByLabel('Frames per second',{exact:true}).inputValue(),'30');
    assert.match(await page.locator('.gif-source').innerText(),/1920 × 1080 px/);
    assert.match(await page.locator('.gif-source').innerText(),/59.94 fps/);
    await page.locator('#tweet').fill('https://127.0.0.1/private');
    await page.locator('.gif-source .alert').waitFor();
    assert.equal(await page.getByText('Source detected',{exact:true}).count(),0);
    assert.equal(await page.getByLabel('Width (pixels)',{exact:true}).inputValue(),'');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: real metadata, single upload, GIF overrides, source reset, mocked link auto defaults and invalid URL`);
    await page.close();
  }
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true});}
