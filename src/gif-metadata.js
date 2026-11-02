import {ref, watch, onUnmounted} from 'vue';
import {twitterUrl} from '../server/utils.js';

export function useGifMetadata(selected, files, settings) {
  const source=ref(null), sourceId=ref(''), pending=ref(false), message=ref(''), error=ref('');
  let version=0, controller, debounce, jobId;
  function stop() {
    version++;clearTimeout(debounce);controller?.abort();
    if(jobId)fetch(`/api/jobs/${jobId}`,{method:'DELETE'}).catch(()=>{});
    jobId=null;pending.value=false;
  }
  function defaults() {
    if(!source.value)return;
    settings.value.start=0;
    settings.value.duration=Number(Math.min(60,source.value.duration).toFixed(3));
    settings.value.width=Math.min(1280,source.value.width);
    settings.value.fps=Number(Math.min(30,source.value.fps||15).toFixed(3));
  }
  async function inspect(token, chosen, url) {
    controller=new AbortController();const signal=controller.signal;
    try {
      const form=new FormData();form.append('tool','inspect');
      if(chosen)form.append('files',chosen,chosen.name);else form.append('url',url);
      let response=await fetch('/api/jobs',{method:'POST',body:form,signal});
      let data=await response.json();
      if(!response.ok)throw Error(data.error||'Cannot read video details.');
      if(token!==version){fetch(`/api/jobs/${data.id}`,{method:'DELETE'}).catch(()=>{});return;}
      jobId=data.id;
      for(let attempts=0;attempts<900;attempts++) {
        response=await fetch(`/api/jobs/${jobId}`,{signal});data=await response.json();
        if(token!==version)return;
        if(!response.ok)throw Error(data.error||'Cannot read video details.');
        if(data.status==='error'||data.status==='cancelled')throw Error(data.message);
        if(data.status==='done') {
          source.value=data.metadata;sourceId.value=data.id;defaults();pending.value=false;return;
        }
        message.value=data.status==='queued'?'Waiting to read source details…':data.message;
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      throw Error('Reading source details timed out. Try again.');
    }catch(e){if(token!==version||e.name==='AbortError')return;error.value=e.message==='Failed to fetch'?'Cannot reach the processing server. You can still use automatic settings when it reconnects.':e.message;pending.value=false;}
  }
  function refresh() {
    stop();source.value=null;sourceId.value='';error.value='';
    if(selected.value!=='gif')return;
    const chosen=files.value[0], raw=settings.value.url.trim();
    settings.value.start=0;settings.value.duration='';settings.value.width='';settings.value.fps='';
    if(!chosen&&!raw)return;
    if(files.value.length>1){error.value='Choose one video at a time.';return;}
    let url='';
    if(!chosen){try{url=twitterUrl(raw);}catch(e){error.value=e.message;return;}}
    pending.value=true;message.value=chosen?'Uploading once to read exact video details…':'Reading the linked video…';
    const token=version;debounce=setTimeout(()=>inspect(token,chosen,url),chosen?0:700);
  }
  watch([selected,()=>settings.value.url,()=>files.value.slice()],refresh);
  onUnmounted(stop);
  return {source,sourceId,pending,message,error,refresh,defaults};
}
