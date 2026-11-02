import {pages, number, safeName} from '../server/utils.js';
import {zipSync} from 'fflate';

const MAX_BYTES = 300_000_000;
function update(message, progress) { self.postMessage({type:'progress', message, progress}); }
async function zipResults(results) {
  const entries = Object.create(null);
  for (const result of results) entries[result.name] = new Uint8Array(await result.blob.arrayBuffer());
  return new Blob([zipSync(entries, {level:0})], {type:'application/zip'});
}

// Detect animation before rasterizing; never silently discard animation frames.
async function checkImage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = (a,b) => String.fromCharCode(...bytes.subarray(a,b));
  const view = new DataView(bytes.buffer);
  if (text(0,3)==='GIF') {
    // GIFs may contain multiple frames even when browser animation APIs are absent.
    throw new Error('GIF input is skipped to preserve animation. Use PNG, JPEG, WebP or AVIF.');
  }
  if (bytes[0]===137 && text(1,4)==='PNG') {
    for(let offset=8; offset+12<=bytes.length;) {
      const length=view.getUint32(offset);
      if(text(offset+4,offset+8)==='acTL') throw new Error('Animated PNG is skipped to preserve frames.');
      if(length>bytes.length-offset-12) break;
      offset+=length+12;
    }
  }
  if(text(0,4)==='RIFF' && text(8,12)==='WEBP') {
    for(let offset=12; offset+8<=bytes.length;) {
      const length=view.getUint32(offset+4,true), kind=text(offset,offset+4);
      if(kind==='ANIM'||(kind==='VP8X' && (bytes[offset+8]&2))) throw new Error('Animated WebP is skipped to preserve frames.');
      if(length>bytes.length-offset-8)break;
      offset+=8+length+(length%2);
    }
  }
  if(text(4,8)==='ftyp' && text(8,Math.min(64,bytes.length)).includes('avis')) throw new Error('Animated AVIF is skipped to preserve frames.');
  if(/\.(tiff?|heic|heif|raw|cr2|nef|arw)$/i.test(file.name)) throw new Error('This format is not supported by browser processing. Export a PNG or JPEG first.');
}

async function image(file, options) {
  await checkImage(file);
  let bitmap;
  try { bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}); }
  catch {throw new Error('Your browser cannot decode this image. Export it as PNG or JPEG first.');}
  try {
    if(bitmap.width*bitmap.height>40_000_000) throw new Error('Image exceeds the 40-megapixel browser limit.');
    const maxWidth=number(options.width,16,16000,2400), quality=number(options.quality,1,100,80);
    const format=options.format;
    if(!['webp','avif','jpeg','png'].includes(format))throw new Error('Unsupported output format.');
    const width=Math.min(bitmap.width,Math.round(maxWidth)), height=Math.max(1,Math.round(bitmap.height*width/bitmap.width));
    const canvas=new OffscreenCanvas(width,height), ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Your browser does not support image processing. Try a current Chrome, Edge, Firefox or Safari.');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);}
    ctx.drawImage(bitmap,0,0,width,height);
    let blob;
    if(format==='avif') {
      const {encodeAvif}=await import('./avif.js');
      blob=await encodeAvif(ctx.getImageData(0,0,width,height),quality);
    } else {
      const mime=`image/${format}`;
      blob=await canvas.convertToBlob({type:mime,quality:quality/100});
      if(blob.type!==mime)throw new Error(`Your browser cannot encode ${format.toUpperCase()}. Try PNG or JPEG.`);
    }
    canvas.width=1;canvas.height=1;
    return blob;
  } finally {bitmap.close();}
}

self.onmessage=async({data})=>{
  const {tool,files,options}=data, results=[],warnings=[];
  let outputSize=0;
  function add(blob,name,original){
    outputSize+=blob.size;
    if(outputSize>MAX_BYTES)throw new Error('Outputs exceed the 300 MB browser limit. Process fewer files at once.');
    results.push({id:results.length,name,size:blob.size,original,blob});
  }
  try {
    if(!files.length)throw new Error('Choose files first.');
    if(files.reduce((sum,f)=>sum+f.size,0)>MAX_BYTES)throw new Error('Choose up to 300 MB of files per browser batch.');
    if(tool==='pdf') {
      const {PDFDocument}=await import('pdf-lib');
      if(options.mode==='merge') {
        const out=await PDFDocument.create();
        for(let i=0;i<files.length;i++) {
          update(`Reading PDF ${i+1} of ${files.length}`,Math.round(i/files.length*80));
          const doc=await PDFDocument.load(await files[i].arrayBuffer());
          for(const page of await out.copyPages(doc,doc.getPageIndices()))out.addPage(page);
        }
        add(new Blob([await out.save()],{type:'application/pdf'}),'merged.pdf');
      } else {
        if(files.length!==1)throw new Error('Select one PDF to separate.');
        const doc=await PDFDocument.load(await files[0].arrayBuffer());
        const selected=pages(options.pages,doc.getPageCount());
        const groups=options.mode==='each'?selected.map(p=>[p]):[selected];
        for(let i=0;i<groups.length;i++) {
          update(`Copying pages ${i+1} of ${groups.length}`,Math.round(i/groups.length*85));
          const out=await PDFDocument.create();
          for(const page of await out.copyPages(doc,groups[i]))out.addPage(page);
          add(new Blob([await out.save()],{type:'application/pdf'}),options.mode==='each'?`${i+1}-page-${groups[i][0]+1}.pdf`:'extracted-pages.pdf');
        }
      }
    } else if(tool==='images') {
      for(let i=0;i<files.length;i++) {
        const file=files[i];update(`Optimizing image ${i+1} of ${files.length}`,Math.round(i/files.length*90));
        try {
          const blob=await image(file,options);
          add(blob,`${i+1}-${safeName(file.name).replace(/\.[^.]+$/,'')}.${options.format==='jpeg'?'jpg':options.format}`,(data.originalSizes?.[i]??file.size));
        } catch(e){warnings.push(`${safeName(file.name)}: ${e.message}`);}
      }
      if(!results.length)throw new Error(warnings.join('\n')||'No supported images found.');
    } else throw new Error('Unsupported browser tool.');
    update('Packing your downloads…',95);
    const zip=await zipResults(results);
    self.postMessage({type:'done',results,warnings,zip});
  } catch(e){self.postMessage({type:'error',message:e.message||'Processing failed. Try smaller files.',warnings});}
};
