import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const base='http://localhost:3000', dir=await fs.mkdtemp(path.join(os.tmpdir(),'doodle-smoke-'));
async function submit(tool, files, options={}) {
 const form=new FormData();form.append('tool',tool);for(const [k,v] of Object.entries(options))form.append(k,v);
 for(const [name,data] of files)form.append('files',new Blob([data]),name);
 const r=await fetch(`${base}/api/jobs`,{method:'POST',body:form});assert.equal(r.status,200);const {id}=await r.json();
 for(let n=0;n<180;n++) {await new Promise(r=>setTimeout(r,500));const job=await(await fetch(`${base}/api/jobs/${id}`)).json();if(job.status==='error')throw Error(job.message);if(job.status==='done')return job;}
 throw Error('Job timed out');
}
async function data(job,index=0){const r=await fetch(`${base}/api/jobs/${job.id}/files/${index}`);assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());}
try {
 const doc=await PDFDocument.create();doc.addPage([200,200]);doc.addPage([300,300]);const pdf=await doc.save();
 const merge=await submit('pdf',[['a.pdf',pdf],['b.pdf',pdf]],{mode:'merge'});assert.equal((await PDFDocument.load(await data(merge))).getPageCount(),4);console.log('PASS PDF merge');
 const extract=await submit('pdf',[['a.pdf',pdf]],{mode:'extract',pages:'2,1'});const extracted=await PDFDocument.load(await data(extract));assert.equal(extracted.getPages()[0].getWidth(),300);console.log('PASS PDF extract and page order');
 const split=await submit('pdf',[['a.pdf',pdf]],{mode:'each'});assert.equal(split.results.length,2);const zip=Buffer.from(await(await fetch(`${base}/api/jobs/${split.id}/zip`)).arrayBuffer());assert.equal(zip.subarray(0,2).toString(),'PK');console.log('PASS PDF split and ZIP');
 const png=await sharp({create:{width:500,height:400,channels:4,background:'#aabbcc88'}}).png().toBuffer();
 for(const format of ['webp','avif','jpeg','png']) {const images=await submit('images',[['test.png',png],['bad.jpg',Buffer.from('not a photo')]],{format,quality:'80',width:'200'});assert.equal(images.results.length,1);assert.equal(images.warnings.length,1);const m=await sharp(await data(images)).metadata();assert.equal(m.width,200);assert.equal(m.format,format==='avif'?'heif':format);if(format==='avif')assert.equal(m.compression,'av1');console.log(`PASS images ${format}, resize and invalid-file isolation`);}
 const video=path.join(dir,'test.mp4');await new Promise((resolve,reject)=>{const p=spawn(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=320x240:rate=15','-f','lavfi','-i','sine=frequency=440','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video],{windowsHide:true});p.on('error',reject);p.on('exit',c=>c?reject(Error('Fixture creation failed')):resolve());});
 const source=await fs.readFile(video);const compressed=await submit('video',[['test.mp4',source]],{target:'0.1',width:'480'});assert.ok(compressed.results[0].size<=100000);await fs.writeFile(path.join(dir,'compressed.mp4'),await data(compressed));console.log('PASS two-pass video encoding and 100 KB cap');
 const inspected=await submit('inspect',[['test.mp4',source]]);
 assert.equal(inspected.metadata.width,320);assert.equal(inspected.metadata.height,240);assert.equal(inspected.metadata.fps,15);assert.equal(inspected.metadata.duration,3);
 const automatic=await submit('gif',[],{sourceId:inspected.id,limit:'true',target:'1'});
 const autoData=await data(automatic);assert.ok(autoData.subarray(0,6).toString().startsWith('GIF8'));const autoMeta=await sharp(autoData,{animated:true}).metadata();assert.equal(autoMeta.width,320);assert.equal(autoMeta.pages,45);
 assert.equal(automatic.results[0].original,source.length);console.log('PASS metadata detection, automatic source settings and cached-source reuse without another upload');
 const slow=await submit('gif',[],{sourceId:inspected.id,width:'32',fps:'2',duration:'1',limit:'true',target:'0.1'});const slowMeta=await sharp(await data(slow),{animated:true}).metadata();assert.equal(slowMeta.width,32);assert.equal(slowMeta.pages,2);console.log('PASS small-source width and low frame-rate overrides');
 const gif=await submit('gif',[['test.mp4',source]],{target:'0.1',limit:'true',width:'320',fps:'15',start:'0',duration:'3'});const gifData=await data(gif);assert.ok(gifData.subarray(0,6).toString().startsWith('GIF8'));assert.ok(gifData.length<=100000);console.log('PASS actual animated GIF and 100 KB cap');
 console.log('All processing smoke tests passed.');
} finally {await fs.rm(dir,{recursive:true,force:true});}

