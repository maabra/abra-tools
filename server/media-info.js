export function frameRate(value) {
  if (value == null || value === '') return null;
  const parts=String(value).split('/').map(Number);
  const rate=parts.length===2 ? parts[0]/parts[1] : parts.length===1 ? parts[0] : NaN;
  return Number.isFinite(rate) && rate>0 && rate<=1000 ? rate : null;
}

export function videoMetadata(data) {
  const video=data.streams?.find(s=>s.codec_type==='video' && !s.disposition?.attached_pic);
  if(!video)throw new Error('This file does not contain a video stream.');
  const duration=[Number(video.duration),Number(data.format?.duration)].find(n=>Number.isFinite(n)&&n>0);
  if(!duration)throw new Error('Cannot determine this video duration.');
  let width=Number(video.width), height=Number(video.height);
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)throw new Error('Cannot determine this video dimensions.');
  const rotation=Number(video.side_data_list?.find(s=>s.rotation!=null)?.rotation??video.tags?.rotate??0);
  if(Math.abs(Math.round(rotation/90))%2===1)[width,height]=[height,width];
  return {duration,width,height,fps:frameRate(video.avg_frame_rate)||frameRate(video.r_frame_rate),audio:data.streams.some(s=>s.codec_type==='audio')};
}
