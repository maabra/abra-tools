// SVG needs an HTML image decoder in browsers that cannot decode it in a worker.
// Loading SVG as an image disables scripts and external resource loading.
export async function prepareFile(file) {
  if(!/\.svg$/i.test(file.name))return file;
  const url=URL.createObjectURL(file);
  try {
    const img=new Image();img.src=url;await img.decode();
    if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40_000_000)throw new Error('SVG exceeds the 40-megapixel limit or has no dimensions.');
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    canvas.getContext('2d').drawImage(img,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    canvas.width=1;canvas.height=1;
    if(!blob)throw new Error('SVG could not be rasterized.');
    return new File([blob],file.name,{type:'image/png',lastModified:file.lastModified});
  } finally {URL.revokeObjectURL(url);}
}
