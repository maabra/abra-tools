<script setup>
import {ref,watch,onMounted,onUnmounted} from 'vue';
const props=defineProps({document:Object,page:Number,rotation:{type:Number,default:0},large:Boolean});
const host=ref(),canvas=ref(),visible=ref(false),failure=ref(''),rendering=ref(true);
let observer,task,version=0;
async function draw(){
 if(!visible.value){version++;task?.cancel();if(canvas.value){canvas.value.width=1;canvas.value.height=1;}rendering.value=true;return;}
 if(!canvas.value||!props.document)return;
 const token=++version;task?.cancel();rendering.value=true;failure.value='';
 try{
  const page=await props.document.getPage(props.page+1);if(token!==version)return;
  const original=page.getViewport({scale:1,rotation:(page.rotate+props.rotation)%360});
  const scale=Math.min((props.large?850:230)/original.width,(props.large?1050:290)/original.height,2);
  const viewport=page.getViewport({scale,rotation:(page.rotate+props.rotation)%360});
  canvas.value.width=Math.ceil(viewport.width);canvas.value.height=Math.ceil(viewport.height);
  task=page.render({canvas:canvas.value,canvasContext:canvas.value.getContext('2d'),viewport});
  await task.promise;if(token===version)rendering.value=false;
 }catch(e){if(token===version&&e.name!=='RenderingCancelledException'){failure.value='Preview unavailable. The original page can still be exported.';rendering.value=false;}}
}
watch(()=>[props.document,props.page,props.rotation,visible.value],draw);
onMounted(()=>{observer=new IntersectionObserver(entries=>{visible.value=entries.some(e=>e.isIntersecting);},{rootMargin:'250px'});observer.observe(host.value);});
onUnmounted(()=>{version++;observer?.disconnect();task?.cancel();if(canvas.value){canvas.value.width=1;canvas.value.height=1;}});
</script>
<template><div ref="host" class="pdf-preview"><canvas ref="canvas" v-show="!failure" aria-hidden="true"></canvas><span v-if="failure" class="hint">{{failure}}</span><span v-else-if="rendering" class="preview-status">Rendering page…</span></div></template>
