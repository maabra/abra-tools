export function number(value, min, max, fallback) {
 const n = value === undefined || value === '' ? fallback : Number(value);
 if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Enter a number between ${min} and ${max}.`);
 return n;
}
export function pages(spec, count) {
 if (!spec?.trim()) return Array.from({length:count}, (_,i)=>i);
 const result=[];
 for (const part of spec.split(',')) {
  const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) throw new Error('Use page ranges like 1-3, 5, 8-10.');
  const a=+m[1], b=+(m[2]||m[1]);
  if(a<1 || b<a || b>count) throw new Error(`Page range must be within 1–${count}.`);
  for(let i=a;i<=b;i++) result.push(i-1);
 }
 return result;
}
export function twitterUrl(raw) {
 const u=new URL(raw);
 if(u.protocol!=='https:' || u.username || u.password || u.port || !['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname) || !/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(u.pathname)) throw new Error('Use a public https://x.com/username/status/123 post link, or upload its MP4.');
 return u.origin+u.pathname;
}
export function safeName(name) { return name.replace(/\\/g,'/').split('/').pop().replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(-120)||'file'; }
