import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import probe from 'ffprobe-static';
import { PDFDocument } from 'pdf-lib';
import { ZipArchive } from 'archiver';
import { spawn } from 'node:child_process';
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { number, pages, twitterUrl, safeName } from './utils.js';
import { hostingConfig, allowedRequest } from './hosting.js';

const app=express(), root=await fs.mkdtemp(path.join(os.tmpdir(),'doodle-tools-'));
const hosting = hostingConfig();
const jobs=new Map(); let active=false; const queue=[];
const upload=multer({dest:root,limits:{fileSize:1024*1024*1024,files:200,fields:20}});
app.disable('x-powered-by');
app.get('/healthz', (req, res) => res.json({ok:true}));
// Hosted requests use the explicitly configured public origin. Keep local access local.
app.use('/api',(req,res,next)=>{
 if(!allowedRequest(hosting, req.hostname, req.headers.origin, req.headers.host)) return res.status(403).json({error:'This host or request origin is not allowed. Check PUBLIC_ORIGIN.'});
 next();
});
function run(job, bin,args, timeout=30*60*1000) {
 return new Promise((resolve,reject)=>{
  if(job.cancelled) return reject(new Error('Cancelled.'));
  const child=spawn(bin,args,{windowsHide:true,env:{...process.env,PYTHONPATH:path.resolve('.tools')+path.delimiter+(process.env.PYTHONPATH||'')}}); job.child=child;
  let output=''; const timer=setTimeout(()=>{child.kill();reject(new Error('Processing timed out. Try a shorter or smaller file.'));},timeout);
  for(const stream of [child.stdout,child.stderr]) stream.on('data',d=>{output=(output+d).slice(-12000);});
  child.on('error',e=>{clearTimeout(timer);reject(new Error(e.code==='ENOENT'?'Required program is missing. For Twitter links, install yt-dlp (see README).':e.message));});
  child.on('close',code=>{clearTimeout(timer);job.child=null;code===0?resolve(output):reject(new Error(job.cancelled?'Cancelled.':`The file could not be processed. It may be damaged, protected, unsupported, or unavailable. ${output.slice(-450)}`));});
 });
}
async function result(job,file,name,original) {
 const size=(await fs.stat(file)).size;
 job.results.push({id:job.results.length,name,size,original});
 job.paths.push(file);
}
async function info(job,input) {
 const data=JSON.parse(await run(job,probe.path,['-v','error','-show_format','-show_streams','-of','json',input],60000));
 if(!data.streams.some(s=>s.codec_type==='video')) throw new Error('This file does not contain a video stream.');
 const duration=Number(data.format.duration);
 if(!Number.isFinite(duration)||duration<=0) throw new Error('Cannot determine this video’s duration.');
 return {duration,audio:data.streams.some(s=>s.codec_type==='audio'),video:data.streams.find(s=>s.codec_type==='video')};
}
async function processJob(job) {
 const o=job.options, files=job.files;
 if(job.tool==='pdf') {
  if(!files.length) throw new Error('Choose at least one PDF.');
  if(o.mode==='merge') {
   const out=await PDFDocument.create();
   for(const f of files) {job.message=`Reading ${f.originalname}`;const doc=await PDFDocument.load(await fs.readFile(f.path));for(const p of await out.copyPages(doc,doc.getPageIndices())) out.addPage(p);}
   const dest=path.join(job.dir,'merged.pdf');await fs.writeFile(dest,await out.save());await result(job,dest,'merged.pdf');
  } else {
   if(files.length!==1) throw new Error('Select one PDF to separate.');
   const doc=await PDFDocument.load(await fs.readFile(files[0].path));
   const groups=o.mode==='each'?pages(o.pages,doc.getPageCount()).map(p=>[p]):[pages(o.pages,doc.getPageCount())];
   for(let i=0;i<groups.length;i++) {const out=await PDFDocument.create();for(const p of await out.copyPages(doc,groups[i]))out.addPage(p); const name=o.mode==='each'?`${i+1}-page-${groups[i][0]+1}.pdf`:'extracted-pages.pdf'; const dest=path.join(job.dir,`${i}.pdf`);await fs.writeFile(dest,await out.save());await result(job,dest,name);}
  }
 } else if(job.tool==='images') {
  if(!files.length) throw new Error('Choose images first.');
  const quality=number(o.quality,1,100,80), width=number(o.width,16,16000,2400);
  const format=['webp','avif','jpeg','png'].includes(o.format)?o.format:'webp';
  for(let i=0;i<files.length;i++) {
   if(job.cancelled) throw new Error('Cancelled.');
   const f=files[i];job.message=`Optimizing image ${i+1} of ${files.length}`;job.progress=Math.round(i/files.length*95);
   try {
    const metadata=await sharp(f.path,{limitInputPixels:100000000}).metadata();
    if((metadata.pages||1)>1) throw new Error('Animated/multipage images are skipped to preserve their frames. Use the GIF tool for video.');
    let pipeline=sharp(f.path,{limitInputPixels:100000000}).rotate().resize({width,withoutEnlargement:true});
    if(format==='jpeg') pipeline=pipeline.flatten({background:'#ffffff'});
    const dest=path.join(job.dir,`${i}.${format}`);
    await pipeline.toFormat(format,format==='png'?{compressionLevel:9,palette:true,quality}:{quality,effort:format==='avif'?5:6}).toFile(dest);
    const outsize=(await fs.stat(dest)).size;
    // Keep the smaller original only when the requested format already matches and dimensions need no reduction.
    if(outsize>=f.size && metadata.format===format && metadata.width<=width) {await fs.copyFile(f.path,dest);}
    await result(job,dest,`${i+1}-${safeName(f.originalname).replace(/\.[^.]+$/,'')}.${format==='jpeg'?'jpg':format}`,f.size);
   } catch(e) {job.warnings.push(`${safeName(f.originalname)}: ${e.message}`);}
  }
  if(!job.results.length) throw new Error(job.warnings.join('\n')||'No supported images found.');
 } else {
  if(files.length>1) throw new Error('Choose one video at a time.');
  let input=files[0]?.path;
  if(!input && job.tool==='gif' && o.url) {
   const url=twitterUrl(o.url);job.message='Fetching public Twitter / X video…';
   input=path.join(job.dir,'source.mp4');
   const localYtdlp=await fs.access(path.resolve('.tools/yt_dlp/__main__.py')).then(()=>true,()=>false);
   await run(job,process.env.YTDLP_BIN||(localYtdlp?'python':'yt-dlp'),[...(localYtdlp&&!process.env.YTDLP_BIN?['-m','yt_dlp']:[]),'--no-playlist','--no-warnings','--max-filesize','200M','--socket-timeout','25','--no-part','-f','best[ext=mp4]','-o',input,'--',url],120000);
  }
  if(!input) throw new Error('Choose a video, or paste a public Twitter / X post link.');
  const meta=await info(job,input), dest=path.join(job.dir,job.tool==='gif'?'animation.gif':'video.mp4');
  if(job.tool==='video') {
   const cap=number(o.target,0.1,1000,8)*1000000;
   let totalRate=cap*8/meta.duration*0.95;
   const audio=meta.audio&&o.mute!=='true'?Math.min(96000,totalRate*0.15):0;
   let rate=totalRate-audio;
   if(rate<12000) throw new Error('This size is too small for the video’s duration. Increase the limit or use a shorter clip.');
   const maxWidth=number(o.width,160,3840,1280);
   for(let attempt=0;attempt<3;attempt++) {
    const w=Math.min(maxWidth,rate<200000?480:rate<500000?854:maxWidth);
    const base=['-y','-v','error','-i',input,'-map','0:v:0','-vf',`scale=w='min(${w},iw)':h=-2:force_divisible_by=2`,'-c:v','libx264','-preset','slow','-b:v',`${Math.floor(rate)}`,'-pix_fmt','yuv420p','-threads','2','-passlogfile',path.join(job.dir,'pass')];
    job.message=`Analyzing video · pass 1${attempt?' · adjusting size':''}`;job.progress=15+attempt*20;
    await run(job,ffmpeg,[...base,'-pass','1','-an','-f','null',os.platform()==='win32'?'NUL':'/dev/null']);
    job.message='Encoding video · pass 2';job.progress=40+attempt*15;
    await run(job,ffmpeg,[...base,'-pass','2',...(audio?['-map','0:a:0?','-c:a','aac','-b:a',`${Math.floor(audio)}`]:['-an']),'-movflags','+faststart',dest]);
    const size=(await fs.stat(dest)).size;if(size<=cap) break;
    rate*=cap/size*0.92;
    if(attempt===2) throw new Error('Could not meet this limit. Try a larger target. No oversized file has been returned.');
   }
   await result(job,dest,'smaller-video.mp4',files[0].size);
  } else {
   const start=number(o.start,0,Math.max(0,meta.duration-0.01),0), duration=Math.min(number(o.duration,0.1,60,10),meta.duration-start);
   let width=number(o.width,80,1280,640), fps=number(o.fps,5,30,15);
   const cap=o.limit==='true'?number(o.target,0.1,100,5)*1000000:Infinity;
   for(let attempt=0;attempt<9;attempt++) {
    job.message=`Drawing GIF frames${attempt?' · reducing size':''}`;job.progress=10+attempt*9;
    await run(job,ffmpeg,['-y','-v','error','-ss',`${start}`,'-t',`${duration}`,'-i',input,'-filter_complex',`fps=${fps},scale=w='min(${Math.round(width)},iw)':h=-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,'-an','-loop','0','-threads','2',dest]);
    if((await fs.stat(dest)).size<=cap) break;
    width=Math.max(64,width*0.78);fps=Math.max(5,fps-2);
    if(attempt===8) throw new Error('This GIF cannot fit the limit. Try a shorter duration or a larger size limit.');
   }
   await result(job,dest,'actual-animation.gif',files[0]?.size);
  }
 }
}
async function drain() {
 if(active)return;active=true;
 while(queue.length) {
  const job=queue.shift();
  if(job.cancelled){await Promise.all(job.files.map(f=>fs.unlink(f.path).catch(()=>{})));continue;}
  job.status='processing';
  try {await processJob(job);if(job.cancelled)throw new Error('Cancelled.');job.status='done';job.progress=100;job.message='Your files are ready!';}
  catch(e){job.status=job.cancelled?'cancelled':'error';job.message=e.message;}
  finally {await Promise.all(job.files.map(f=>fs.unlink(f.path).catch(()=>{})));job.finished=Date.now();}
 }
 active=false;
}
app.post('/api/jobs', (req,res,next)=>{if(queue.length>=8||jobs.size>=100)return res.status(429).json({error:'The queue is full. Please try again shortly.'});next();}, upload.array('files',200), async(req,res)=>{
 if(!['pdf','video','gif','images'].includes(req.body.tool)) {await Promise.all((req.files||[]).map(f=>fs.unlink(f.path)));return res.status(400).json({error:'Unknown tool.'});}
 const id=randomUUID(), dir=path.join(root,id);await fs.mkdir(dir);
 const job={id,dir,tool:req.body.tool,options:req.body,files:req.files||[],status:'queued',message:'Waiting for the workbench…',progress:0,results:[],paths:[],warnings:[],created:Date.now()};
 jobs.set(id,job);queue.push(job);res.json({id});drain();
});
app.get('/api/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:'Job expired. Run the tool again.'});res.json({id:j.id,status:j.status,message:j.message,progress:j.progress,results:j.results,warnings:j.warnings});});
app.delete('/api/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id);if(j&&['queued','processing'].includes(j.status)){j.cancelled=true;j.status='cancelled';j.child?.kill();j.finished=Date.now();}res.json({ok:true});});
app.get('/api/jobs/:id/files/:index',(req,res)=>{const j=jobs.get(req.params.id), i=Number(req.params.index);if(!j||j.status!=='done'||!j.results[i])return res.sendStatus(404);res.download(j.paths[i],j.results[i].name);});
app.get('/api/jobs/:id/zip',(req,res)=>{
 const j=jobs.get(req.params.id);if(!j||j.status!=='done')return res.sendStatus(404);
 res.attachment('doodle-tools.zip');const archive=new ZipArchive({zlib:{level:0}});archive.on('error',()=>res.destroy());res.on('close',()=>archive.abort());archive.pipe(res);
 j.results.forEach((r,i)=>archive.file(j.paths[i],{name:r.name}));archive.finalize();
});
app.use((err,req,res,next)=>{Promise.all((req.files||[]).map(f=>fs.unlink(f.path).catch(()=>{})));res.status(400).json({error:err instanceof multer.MulterError?'Upload limit exceeded: maximum 200 files, 1 GB per file.':err.message});});
setInterval(async()=>{for(const [id,j] of jobs){if(j.finished&&Date.now()-j.finished>60*60*1000){jobs.delete(id);await fs.rm(j.dir,{recursive:true,force:true});await Promise.all(j.files.map(f=>fs.unlink(f.path).catch(()=>{})));}}},60000).unref();
if(process.env.NODE_ENV==='production')app.use(express.static('dist'));
else {const {createServer}=await import('vite');const vite=await createServer({configLoader:'native',server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
app.listen(hosting.port,hosting.host,()=>console.log(`Doodle Tools is listening on ${hosting.host}:${hosting.port}`));







