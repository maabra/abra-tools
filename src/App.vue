<script setup>
import {ref, computed, onUnmounted, defineAsyncComponent} from 'vue';
import ToolIllustration from './ToolIllustration.vue';
import {prepareFile} from './browser-jobs.js';
import {useGifMetadata} from './gif-metadata.js';
import { ArrowUpRight, ArrowRight, UploadCloud, FileText, Film, Image, Sparkles, X, Check, Download, ArrowUp, ArrowDown, FolderOpen, ShieldCheck, Menu, LoaderCircle, CircleHelp, Plus, WandSparkles } from '@lucide/vue';
const PdfOrganizer=defineAsyncComponent(()=>import('./PdfOrganizer.vue'));
const pdfState=ref({loading:true,pages:[],errors:[]});
const tools=[
 {id:'pdf',name:'PDF playground',short:'PDF',tag:'A little less paperwork.',description:'Bring pages together. Or give them some space.',icon:FileText,color:'peach',action:'Merge & separate',doodle:'pages'},
 {id:'video',name:'Video squeeze',short:'Video',tag:'Big moments. Smaller files.',description:'Keep the good stuff. Lose the extra megabytes.',icon:Film,color:'lavender',action:'Shrink a video',doodle:'video'},
 {id:'gif',name:'Actually a GIF',short:'GIF',tag:'Let it loop. For real.',description:'Turn those Twitter “GIFs” into the real thing.',icon:Sparkles,color:'yellow',action:'Make a GIF',doodle:'gif'},
 {id:'images',name:'Image squish',short:'Images',tag:'A lighter kind of picture.',description:'One photo or a whole folder. Less weight, more wow.',icon:Image,color:'mint',action:'Optimize images',doodle:'image'}
];
const selected=ref(null),current=computed(()=>tools.find(t=>t.id===selected.value)),files=ref([]),dragging=ref(false),error=ref(''),job=ref(null),busy=ref(false),uploadPercent=ref(0),uploading=ref(false),help=ref(false), mobile=ref(false);
const input=ref(),folder=ref();let timer, xhr, generation=0, localWorker; const resultUrls=[];
const isLocal=computed(()=>['pdf','images'].includes(selected.value));
function clearResults(){for(const url of resultUrls)URL.revokeObjectURL(url);resultUrls.length=0;job.value=null;}
function closeTool(){if(busy.value)return;clearResults();selected.value=null;}
function resultUrl(r){return job.value.local?r.url:`/api/jobs/${job.value.id}/files/${r.id}`;}
function zipUrl(){return job.value.local?job.value.zipUrl:`/api/jobs/${job.value.id}/zip`;}
const settings=ref({mode:'merge',pages:'',target:8,width:1280,mute:false,format:'webp',quality:80,url:'',start:0,duration:10,fps:15,limit:true});
const {source:gifSource,sourceId:gifSourceId,pending:gifReading,message:gifReadMessage,error:gifReadError,refresh:readGif,defaults:resetGifDefaults}=useGifMetadata(selected,files,settings);
const accept=computed(()=>selected.value==='pdf'?'.pdf':selected.value==='images'?'.jpg,.jpeg,.png,.webp,.avif,.gif,.tif,.tiff,.svg,.heic,.heif,.bmp,.ico':'video/*,.mkv,.mov,.webm,.mp4');
const bytes=n=>n<1000000?`${(n/1000).toFixed(1)} KB`:`${(n/1000000).toFixed(2)} MB`;
const total=computed(()=>files.value.reduce((sum,f)=>sum+f.size,0));
function open(id){if(busy.value)return;selected.value=id;files.value=[];error.value='';clearResults();settings.value={mode:id==='pdf'?'organize':'merge',pages:'',target:id==='gif'?5:8,width:id==='images'?2400:id==='gif'?640:1280,mute:false,format:'webp',quality:80,url:'',start:0,duration:10,fps:15,limit:true};mobile.value=false;setTimeout(()=>document.querySelector('#workbench')?.scrollIntoView({behavior:'smooth',block:'start'}),30);}
function add(list){if(busy.value)return;error.value='';clearResults();const incoming=Array.from(list);if(files.value.length+incoming.length>200){error.value='Choose up to 200 files at a time.';return;}for(const f of incoming){if(f.size>1e9){error.value=`${f.name} is over the 1 GB file limit.`;continue;}if(!f.size){error.value=`${f.name} is empty and was skipped.`;continue;}if(!files.value.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified&&x.webkitRelativePath===f.webkitRelativePath))files.value.push(f);}if(input.value)input.value.value='';if(folder.value)folder.value.value='';}
function drop(e){dragging.value=false;add(e.dataTransfer.files);}
function move(i,d){const a=files.value.splice(i,1)[0];files.value.splice(i+d,0,a);}
async function poll(id,token){if(token!==generation)return;try{const r=await fetch(`/api/jobs/${id}`);const data=await r.json();if(token!==generation)return;if(!r.ok)throw Error(data.error);error.value='';job.value=data;if(['done','error','cancelled'].includes(data.status)){busy.value=false;return;}timer=setTimeout(()=>poll(id,token),1000);}catch(e){if(token!==generation)return;error.value='Connection lost. Retrying…';timer=setTimeout(()=>poll(id,token),3000);}}
async function submit(){if(selected.value==='gif'&&gifReading.value)return;error.value='';clearResults();if(!files.value.length&&!(selected.value==='gif'&&settings.value.url.trim())){error.value='Add a file to get started.';return;}if(['video','gif'].includes(selected.value)&&files.value.length>1){error.value='Choose one video at a time.';return;}if(selected.value==='pdf'&&['extract','each'].includes(settings.value.mode)&&files.value.length!==1){error.value='Select a single PDF to separate its pages.';return;}
 if(selected.value==='pdf'&&settings.value.mode==='organize'&&(pdfState.value.loading||!pdfState.value.pages.length)){error.value='Wait for page previews and keep at least one page.';return;}
 if(isLocal.value){await submitLocal();return;}
 busy.value=true;uploading.value=true;uploadPercent.value=0;const token=++generation;const form=new FormData();form.append('tool',selected.value);Object.entries(settings.value).forEach(([k,v])=>form.append(k,String(v)));if(selected.value==='gif'&&gifSourceId.value)form.append('sourceId',gifSourceId.value);else files.value.forEach(f=>form.append('files',f,f.name));
 xhr=new XMLHttpRequest();xhr.open('POST','/api/jobs');xhr.upload.onprogress=e=>{if(e.lengthComputable)uploadPercent.value=Math.round(e.loaded/e.total*100);};xhr.onload=()=>{uploading.value=false;if(token!==generation)return;try{const data=JSON.parse(xhr.responseText);if(xhr.status!==200)throw Error(data.error||'Upload failed.');job.value={id:data.id,status:'queued',message:'Getting the workbench ready…',progress:0,results:[],warnings:[]};poll(data.id,token);}catch(e){error.value=e.message;busy.value=false;}};xhr.onerror=()=>{uploading.value=false;busy.value=false;error.value='Cannot reach the processing server. Please try again shortly.';};xhr.send(form);
}
async function submitLocal(){
 const tool=selected.value, options={...settings.value,organizedPages:pdfState.value.pages.map(page=>({...page}))}, chosen=[...files.value], token=++generation;
 busy.value=true;uploading.value=false;job.value={local:true,status:'processing',progress:1,message:'Preparing your browser workbench...',results:[],warnings:[]};
 try {
  if(chosen.reduce((n,f)=>n+f.size,0)>300000000)throw Error('Choose up to 300 MB of files per browser batch.');
  const prepared=[];
  for(const file of chosen){
   if(token!==generation)return;
   try{prepared.push(tool==='images'?await prepareFile(file):file);}catch{prepared.push(file);}
  }
  if(token!==generation)return;
  localWorker=new Worker(new URL('./local.worker.js',import.meta.url),{type:'module'});
  localWorker.onmessage=({data})=>{
   if(token!==generation)return;
   if(data.type==='progress'){job.value.message=data.message;job.value.progress=data.progress;return;}
   if(data.type==='done'){
    const results=data.results.map(r=>{const url=URL.createObjectURL(r.blob);resultUrls.push(url);return {...r,url};});
    const zipUrl=URL.createObjectURL(data.zip);resultUrls.push(zipUrl);
    job.value={local:true,status:'done',progress:100,results,warnings:data.warnings,zipUrl};
   }else{job.value={local:true,status:'error',message:data.message,results:[],warnings:data.warnings||[]};}
   busy.value=false;localWorker.terminate();localWorker=null;
  };
  localWorker.onerror=()=>{if(token!==generation)return;job.value={local:true,status:'error',message:'Browser processing failed. Try smaller files or a current browser.',warnings:[]};busy.value=false;localWorker?.terminate();localWorker=null;};
  localWorker.postMessage({tool,files:prepared,options,originalSizes:chosen.map(f=>f.size)});
 }catch(e){if(token!==generation)return;busy.value=false;job.value={local:true,status:'error',message:e.message,warnings:[]};}
}
async function cancel(){generation++;clearTimeout(timer);localWorker?.terminate();localWorker=null;xhr?.abort();if(job.value?.id&&!job.value.local)await fetch(`/api/jobs/${job.value.id}`,{method:'DELETE'}).catch(()=>{});busy.value=false;uploading.value=false;clearResults();error.value='Processing cancelled.';}
onUnmounted(()=>{generation++;clearTimeout(timer);xhr?.abort();localWorker?.terminate();clearResults();});
</script>

<template>
 <div class="page-shell">
  <header class="header"><a href="#" class="brand" @click.prevent="closeTool"><span class="brand-icon"><WandSparkles :size="24"/></span>Abra<span class="brand-light">&nbsp;Tools</span><span class="brand-dot">&#10035;</span></a><nav :class="{show:mobile}"><a href="#tools" @click="mobile=false">The toolbox <span>&#8599;</span></a><button @click="help=!help">How it works <CircleHelp :size="15"/></button></nav><span class="local-badge"><span></span> Made for your everyday</span><button class="mobile-menu" aria-label="Toggle menu" @click="mobile=!mobile"><Menu/></button></header>
  <main>
   <section class="hero">
    <h1>Your files.<br>A little <span class="magic-word">lighter.<svg viewBox="0 0 400 25" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M4 12 Q160 -2 395 9 M20 22 Q200 7 370 18"/></svg></span></h1>
    <div class="hero-bottom"><a class="button ink" href="#tools">Find your tool <ArrowRight :size="18"/></a></div>
    <ToolIllustration kind="hero" class="hero-art"/>
   </section>
   <section id="tools" class="toolbox" aria-label="The toolbox">
    <div class="cards"><button v-for="(t,i) in tools" :key="t.id" :class="['tool-card',t.color,{chosen:selected===t.id}]" @click="open(t.id)" :disabled="busy" :aria-pressed="selected===t.id"><div class="card-top"><span class="tool-number">0{{i+1}}</span><ArrowUpRight class="card-arrow" :size="22"/></div><div class="card-doodle"><ToolIllustration :kind="t.id"/></div><h3>{{t.name}}</h3><p>{{t.description}}</p><span class="card-action">{{t.action}} <ArrowRight :size="17"/></span></button></div>
   </section>
   <section v-if="selected" id="workbench" class="workbench" :class="current.color">
    <div class="bench-heading"><div><span class="eyebrow">YOUR WORKBENCH / {{current.short.toUpperCase()}}</span><h2><component :is="current.icon" :size="27"/> {{current.name}}</h2></div><button class="icon-btn" :disabled="busy" @click="closeTool" aria-label="Close tool"><X/></button></div>
    <form @submit.prevent="submit"><fieldset :disabled="busy">
     <div v-if="selected==='pdf'" class="segmented"><label v-for="[value,label] in [['organize','Organize pages'],['merge','Merge PDFs'],['extract','Extract pages'],['each','Separate pages']]" :class="{active:settings.mode===value}"><input type="radio" v-model="settings.mode" :value="value">{{label}}</label></div>
     <div v-if="selected==='gif'" class="url-input"><label for="tweet">Twitter / X post link <span class="muted">(or upload an MP4 below)</span></label><input id="tweet" v-model="settings.url" type="url" placeholder="https://x.com/username/status/…" :disabled="files.length>0"><p class="hint">Public posts only. If X blocks access, save the MP4 and upload it here.</p></div>
     <div class="dropzone" :class="{dragging}" @dragover.prevent="dragging=true" @dragleave.prevent="dragging=false" @drop.prevent="drop"><span class="upload-icon"><UploadCloud :size="31"/></span><h3>Drop {{selected==='pdf'?'your PDFs':selected==='images'?'your images':'your video'}} right here</h3><p>or pick them the old-fashioned way</p><div class="browse-actions"><button type="button" class="button small" @click="input.click()"><Plus :size="16"/> Choose files</button><button v-if="selected==='images'" type="button" class="button small" @click="folder.click()"><FolderOpen :size="16"/> Choose folder</button></div><span class="hint">{{selected==='images'?'JPG, PNG, WebP, AVIF, SVG & BMP · up to 200 files':selected==='pdf'?'PDF documents · up to 200 files':'MP4, MOV, WebM, MKV & more · one video at a time'}} · {{isLocal?'300 MB per batch / images up to 40 MP':'1 GB per file'}}</span><input ref="input" type="file" hidden :accept="accept" :multiple="selected==='images'||selected==='pdf'" @change="add($event.target.files)"><input ref="folder" type="file" hidden multiple webkitdirectory @change="add($event.target.files)"></div>
     <div v-if="files.length" class="file-list"><div class="file-summary">{{files.length}} file{{files.length===1?'':'s'}} · {{bytes(total)}}<button type="button" @click="files=[]">Clear all</button></div><div v-for="(f,i) in files" :key="`${f.name}-${i}`" class="file-row"><FileText :size="18"/><span class="filename">{{f.webkitRelativePath||f.name}}</span><span class="muted">{{bytes(f.size)}}</span><template v-if="selected==='pdf'&&settings.mode==='merge'"><button type="button" :disabled="i===0" @click="move(i,-1)" aria-label="Move PDF up"><ArrowUp :size="16"/></button><button type="button" :disabled="i===files.length-1" @click="move(i,1)" aria-label="Move PDF down"><ArrowDown :size="16"/></button></template><button type="button" @click="files.splice(i,1)" aria-label="Remove file"><X :size="16"/></button></div></div>
     <PdfOrganizer v-if="selected==='pdf'&&settings.mode==='organize'&&files.length" :files="files" :disabled="busy" @change="pdfState=$event;clearResults()"/>
     <div class="settings-grid">
      <template v-if="selected==='pdf'"><label v-if="['extract','each'].includes(settings.mode)">Pages to include<input v-model="settings.pages" placeholder="All pages, or e.g. 1-3, 5, 8-10"><span class="hint">Page numbers start at 1. Order and repeats are preserved.</span></label><p class="hint settings-note">{{settings.mode==='organize'?'The checked pages above become one PDF in the order shown. Previews are visual only; original vector pages are preserved.':settings.mode==='merge'?'PDFs are merged in the order above. Use the arrows to rearrange them.':'Extract returns one PDF. Separate returns a PDF for each selected page.'}} Password-protected documents must be unlocked first. Interactive forms, signatures and bookmarks may not survive copying.</p></template>
      <template v-if="selected==='video'"><label>Maximum file size<div class="presets"><button v-for="n in [8,20,50]" type="button" @click="settings.target=n" :class="{active:settings.target===n}">{{n}} MB</button></div><div class="with-unit"><input v-model="settings.target" type="number" min="0.1" max="1000" step="0.1" required><span>MB</span></div></label><label>Maximum video width<select v-model="settings.width"><option :value="1920">1920 px · Full HD</option><option :value="1280">1280 px · Balanced</option><option :value="854">854 px · Smaller</option><option :value="480">480 px · Compact</option></select><span class="hint">Resolution adapts to the size budget. MP4 / H.264 output.</span></label><label class="checkbox"><input v-model="settings.mute" type="checkbox"> Remove audio for a smaller file</label></template>
      <template v-if="selected==='gif'">
       <div class="gif-source" aria-live="polite">
        <p v-if="gifReading" role="status"><LoaderCircle class="spin" :size="16"/> {{gifReadMessage}}</p>
        <template v-else-if="gifSource"><strong>Source detected</strong><p>{{gifSource.duration.toFixed(3)}} seconds · {{gifSource.width}} × {{gifSource.height}} px · {{gifSource.fps?`${Number(gifSource.fps.toFixed(3))} fps (average)`:'Frame rate unavailable; using 15 fps'}}</p><div class="browse-actions"><button type="button" class="button small" @click="resetGifDefaults">Use source defaults</button><button type="button" class="button small" @click="readGif">Read source again</button></div></template>
        <p v-else>Duration, pixels and frame rate are read automatically when you add a video or paste a post link.</p>
        <div v-if="gifReadError" class="alert" role="alert">{{gifReadError}} <button type="button" class="button small" @click="readGif">Retry reading source</button></div>
        <span class="hint">Auto uses the full clip up to 60 seconds, source width up to 1280 px and source frame rate up to 30 fps. You can override these below. Size limits may reduce the final width and frame rate.</span>
       </div>
       <label>Start time (seconds)<input v-model="settings.start" type="number" min="0" :max="gifSource?Math.max(0,gifSource.duration-0.01):undefined" step="any" required></label>
       <label>Duration (seconds)<input v-model="settings.duration" type="number" min="0.01" max="60" step="any" placeholder="Auto · full clip"></label>
       <label>Width (pixels)<input v-model="settings.width" type="number" min="1" max="1280" placeholder="Auto · source width"></label>
       <label>Frames per second<input v-model="settings.fps" type="number" min="0.1" max="60" step="any" placeholder="Auto · source frame rate"></label>
       <label class="checkbox"><input v-model="settings.limit" type="checkbox"> Keep the GIF under a size limit</label>
       <label v-if="settings.limit">Maximum size (MB)<input v-model="settings.target" type="number" min="0.1" max="100" step="0.1" required><span class="hint">Starts at your chosen quality; lowers width and frame rate only if needed.</span></label><p class="hint">GIFs loop forever and have no audio. Clips are capped at 60 seconds. Leave a setting empty to use its detected source value.</p>
      </template>
      <template v-if="selected==='images'"><label>Output format<select v-model="settings.format"><option value="webp">WebP · Great all-rounder</option><option value="avif">AVIF · Smaller, slower to encode</option><option value="jpeg">JPEG · Widely compatible</option><option value="png">PNG · Lossless</option></select></label><label>Maximum width (pixels)<input v-model="settings.width" type="number" min="16" max="16000" required><span class="hint">Keeps proportions. Never enlarges.</span></label><label>Quality <span class="quality-value">{{settings.quality}}%</span><input v-model="settings.quality" type="range" min="1" max="100" :disabled="settings.format==='png'"><span class="hint">Lower = smaller. Higher = more detail.</span></label><p class="hint settings-note">Images stay in your browser. JPEG uses white for transparency. PNG is lossless; its quality slider does not apply. AVIF uses a local WebAssembly encoder. GIF, animated images, TIFF, HEIC and RAW are skipped; other input support depends on your browser. Conversion may increase size.</p></template>
     </div>
    </fieldset><div v-if="error" class="alert" role="alert">{{error}}</div><div class="bench-footer"><span><ShieldCheck :size="17"/> {{isLocal?'Processed in your browser. Your files are never uploaded.':'Processed on the server. Files expire after 1 hour.'}}</span><button v-if="!busy" class="button ink" type="submit" :disabled="(selected==='gif'&&gifReading)||(selected==='pdf'&&settings.mode==='organize'&&(pdfState.loading||!pdfState.pages.length))"><WandSparkles :size="18"/> {{selected==='pdf'?(settings.mode==='organize'?'Save organized PDF':'Work some PDF magic'):selected==='video'?'Squeeze my video':selected==='gif'?'Make it a GIF':'Squish my images'}}</button><button v-else class="button" type="button" @click="cancel"><X :size="17"/> Cancel</button></div></form>
    <div v-if="busy" class="progress-panel" role="status" aria-live="polite"><LoaderCircle class="spin" :size="22"/><div><strong>{{uploading?`Uploading · ${uploadPercent}%`:job?.message}}</strong><div class="progress-track"><span :style="{width:`${uploading?uploadPercent:job?.progress||4}%`}"></span></div><p class="hint">{{isLocal?'Working on your device. Cancel stops processing immediately.':'Good things take a little processing. Keep this tab open.'}}</p></div></div>
    <div v-if="job?.status==='error'" class="alert" role="alert">{{job.message}}</div>
    <div v-if="job?.status==='done'" class="results"><div class="results-heading"><h3><Check :size="22"/> A little lighter. All yours.</h3><a class="button small" :href="zipUrl()" download="abra-tools.zip"><Download :size="16"/> Download ZIP</a></div><div v-for="r in job.results" :key="r.id" class="result-row"><FileText :size="19"/><div><strong>{{r.name}}</strong><span>{{bytes(r.size)}} <template v-if="r.original">· {{r.size<r.original?`${Math.round((1-r.size/r.original)*100)}% smaller`:'Converted · output is larger than original'}}</template></span></div><a :href="resultUrl(r)" :download="r.name" :aria-label="`Download ${r.name}`"><Download :size="20"/></a></div></div>
    <div v-if="job?.warnings?.length" class="warnings"><strong>A few files need attention</strong><p v-for="w in job.warnings">{{w}}</p></div>
   </section>
   <section class="why"><div class="why-title"><div><h2>Small tools.<br>Thoughtfully made.</h2></div></div><div class="why-item"><ShieldCheck :size="25"/><h3>Your files, your business.</h3><p>PDFs & images stay on your device.<br>Video & GIF jobs use the server.</p></div><div class="why-item"><WandSparkles :size="25"/><h3>Less fiddling. More doing.</h3><p>Sensible defaults. Extra control<br>when you want it.</p></div></section>
   <section v-if="help" class="help-panel"><h2>A quick note from the workbench</h2><p>Choose a tool, add your files, adjust the settings, and press the magic button. Download files individually or together as a ZIP. PDFs and images are processed entirely in your browser without file uploads. Their downloads last until you switch tools, start another batch or close the page. Video and GIF files are uploaded to the processing server and expire one hour after completion; server restarts clear those jobs.</p><p>MB means 1,000,000 bytes. Video limits are verified after encoding; extremely small targets may be impossible. Image conversion can sometimes increase size. PDFs are copied without rasterizing their pages. Public Twitter links require yt-dlp and may be blocked by X; uploading an MP4 always provides a fallback.</p><button class="button small" @click="help=false">Got it <Check :size="16"/></button></section>

  </main>
  <footer><a href="#" class="brand small-brand">Abra<span class="brand-light">&nbsp;Tools</span><span class="brand-dot">&#10035;</span></a><button @click="help=!help">The small print <ArrowUpRight :size="14"/></button></footer>
 </div>
</template>



