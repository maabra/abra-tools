<script setup>
import {ref,shallowRef,watch,onUnmounted,computed} from 'vue';
import {getDocument,GlobalWorkerOptions,PDFWorker} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {RotateCw,ArrowLeft,ArrowRight,Trash2,Undo2,GripVertical,ZoomIn,X} from '@lucide/vue';
import PdfPagePreview from './PdfPagePreview.vue';
GlobalWorkerOptions.workerSrc=workerUrl;
const props=defineProps({files:{type:Array,required:true},disabled:Boolean});
const emit=defineEmits(['change']);
const rows=ref([]),documents=shallowRef(new Map()),loading=ref(false),errors=ref([]),history=ref([]),dragged=ref(null),zoom=ref(null),dialog=ref();
const kept=computed(()=>rows.value.filter(row=>row.included).length);
let version=0,tasks=new Set(),handles=new Map(),counter=0,sharedWorker;
function publish(){emit('change',{loading:loading.value,pages:rows.value.filter(r=>r.included).map(r=>({file:props.files.indexOf(r.file),page:r.page,rotation:r.rotation})),errors:[...errors.value]});}
function save(){history.value.push(rows.value.map(r=>({...r})));if(history.value.length>30)history.value.shift();}
function undo(){if(!history.value.length||props.disabled)return;rows.value=history.value.pop();publish();}
function selectAll(value){save();rows.value.forEach(row=>row.included=value);publish();}
function toggle(row){save();row.included=!row.included;publish();}
function rotate(row){save();row.rotation=(row.rotation+90)%360;publish();}
function remove(row){save();rows.value=rows.value.filter(r=>r.id!==row.id);publish();}
function move(from,to){if(props.disabled||from<0||to<0||from>=rows.value.length||to>=rows.value.length||from===to)return;save();rows.value.splice(to,0,rows.value.splice(from,1)[0]);publish();}
function drop(event,to){event.preventDefault();event.stopPropagation();const from=rows.value.findIndex(r=>r.id===dragged.value);move(from,to);dragged.value=null;}
function enlarge(row){zoom.value=row;dialog.value.showModal();}
function reset(){save();const next=[];for(const file of props.files){const doc=documents.value.get(file);if(doc)for(let page=0;page<doc.numPages;page++)next.push({id:++counter,file,page,rotation:0,included:true});}rows.value=next;publish();}
async function load(){
 const token=++version;loading.value=true;errors.value=[];history.value=[];zoom.value=null;dialog.value?.close();
 for(const task of tasks)task.destroy().catch(()=>{});tasks.clear();
 const currentFiles=new Set(props.files);
 const docs=new Map(documents.value);
 for(const [file] of docs)if(!currentFiles.has(file)){docs.delete(file);handles.get(file)?.destroy().catch(()=>{});handles.delete(file);}
 rows.value=rows.value.filter(r=>currentFiles.has(r.file));documents.value=docs;publish();
 if(props.files.reduce((total,file)=>total+file.size,0)>300000000){errors.value=['Choose up to 300 MB of PDFs per browser batch.'];loading.value=false;publish();return;}
 for(const file of props.files){
  if(token!==version)return;
  if(docs.has(file))continue;
  let task;
  try{
   const data=new Uint8Array(await file.arrayBuffer());if(token!==version)return;
   sharedWorker ||= new PDFWorker();
   task=getDocument({data,worker:sharedWorker,isEvalSupported:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});tasks.add(task);
   // Password-protected PDFs must be unlocked first; do not leave a pending password prompt.
   task.onPassword=updatePassword=>updatePassword(new Error('Password-protected PDF. Unlock this PDF before adding it.'));
   const doc=await task.promise;tasks.delete(task);
   if(token!==version){await task.destroy();return;}
   if(rows.value.length+doc.numPages>2000){await task.destroy();throw Error('The visual organizer supports up to 2,000 pages per batch.');}
   docs.set(file,doc);handles.set(file,task);documents.value=new Map(docs);
   for(let page=0;page<doc.numPages;page++)rows.value.push({id:++counter,file,page,rotation:0,included:true});
   publish();
  }catch(e){if(token!==version)return;errors.value.push(`${file.name}: ${e.name==='PasswordException'||/password|destroyed/i.test(e.message)?'Unlock this PDF before adding it.':e.message}`);tasks.delete(task);await task?.destroy().catch(()=>{});}
 }
 if(token===version){loading.value=false;publish();}
}
watch(()=>props.files.slice(),load,{immediate:true});
onUnmounted(()=>{version++;const cleanup=[...tasks,...handles.values()].map(task=>task.destroy());Promise.allSettled(cleanup).then(()=>sharedWorker?.destroy());});
</script>
<template>
 <section class="pdf-organizer" aria-label="Visual PDF organizer">
  <div class="organizer-heading"><div><h3>Your pages, at a glance.</h3><p>{{kept}} of {{rows.length}} pages kept · {{files.length}} document{{files.length===1?'':'s'}}</p></div><span class="hand-note">drag a page. make it yours.</span></div>
  <p class="hint">Drag thumbnails to reorder. Use arrows on mobile or Alt + Left/Right on a focused page. Uncheck pages to leave them out; rotate or remove pages individually. Add more PDFs above.</p>
  <div class="organizer-toolbar"><button type="button" class="button small" @click="selectAll(true)" :disabled="disabled||loading">Keep all</button><button type="button" class="button small" @click="selectAll(false)" :disabled="disabled||loading">Uncheck all</button><button type="button" class="button small" @click="undo" :disabled="disabled||loading||!history.length"><Undo2 :size="14"/> Undo</button><button type="button" class="button small" @click="reset" :disabled="disabled||loading">Reset pages</button></div>
  <p v-if="loading" class="hint" role="status">Reading PDF pages on your device…</p>
  <div v-for="message in errors" class="alert" role="alert">{{message}}</div>
  <div class="pdf-page-grid" role="list" aria-label="PDF pages in output order">
   <article v-for="(row,i) in rows" :key="row.id" role="listitem" tabindex="0" :aria-label="`Output position ${i+1}, ${row.file.name}, page ${row.page+1}`" class="pdf-page-card" :class="{excluded:!row.included,dragged:dragged===row.id}" :draggable="!disabled&&!loading" @dragstart.stop="dragged=row.id;$event.dataTransfer.effectAllowed='move';$event.dataTransfer.setData('text/plain',String(row.id))" @dragend="dragged=null" @dragover.prevent.stop @drop="drop($event,i)" @keydown.alt.left.prevent="move(i,i-1)" @keydown.alt.right.prevent="move(i,i+1)">
    <div class="pdf-page-top"><label><input type="checkbox" :checked="row.included" :disabled="disabled||loading" @change="toggle(row)" :aria-label="`Keep ${row.file.name} page ${row.page+1}`"> {{i+1}}</label><GripVertical :size="16" aria-hidden="true"/></div>
    <button class="pdf-thumb-button" type="button" @click="enlarge(row)" :aria-label="`Preview ${row.file.name} page ${row.page+1}`"><PdfPagePreview :document="documents.get(row.file)" :page="row.page" :rotation="row.rotation"/><span class="zoom-cue"><ZoomIn :size="14"/> Preview</span></button>
    <div class="pdf-page-caption"><strong :title="row.file.name">{{row.file.name}}</strong><span>Source page {{row.page+1}} <template v-if="row.rotation">· +{{row.rotation}}°</template><template v-if="!row.included"> · Left out</template></span></div>
    <div class="pdf-page-actions"><button type="button" @click="move(i,i-1)" :disabled="disabled||loading||i===0" :aria-label="`Move page at position ${i+1} left`"><ArrowLeft :size="16"/></button><button type="button" @click="move(i,i+1)" :disabled="disabled||loading||i===rows.length-1" :aria-label="`Move page at position ${i+1} right`"><ArrowRight :size="16"/></button><button type="button" @click="rotate(row)" :disabled="disabled||loading" :aria-label="`Rotate page at position ${i+1}`"><RotateCw :size="16"/></button><button type="button" @click="remove(row)" :disabled="disabled||loading" :aria-label="`Remove page at position ${i+1}`"><Trash2 :size="16"/></button></div>
   </article>
  </div>
  <p v-if="!loading&&!kept&&rows.length" class="alert">Keep at least one page to create your PDF.</p>
  <dialog ref="dialog" class="pdf-preview-dialog" @click="$event.target===dialog&&dialog.close()" @close="zoom=null"><template v-if="zoom"><div class="preview-dialog-heading"><strong>{{zoom.file.name}} · Page {{zoom.page+1}}</strong><button type="button" aria-label="Close page preview" @click="dialog.close()"><X/></button></div><PdfPagePreview :document="documents.get(zoom.file)" :page="zoom.page" :rotation="zoom.rotation" large/></template></dialog>
 </section>
</template>
