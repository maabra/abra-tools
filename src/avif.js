import factory from '@jsquash/avif/codec/enc/avif_enc.js';
import wasmUrl from '@jsquash/avif/codec/enc/avif_enc.wasm?url';
import {defaultOptions} from '@jsquash/avif/meta.js';

let encoder;
export async function encodeAvif(image, quality) {
  encoder ||= factory({locateFile: () => wasmUrl});
  const module = await encoder;
  const bytes = module.encode(image.data, image.width, image.height, {...defaultOptions, quality});
  if (!bytes) throw new Error('AVIF encoding failed. Try WebP or JPEG.');
  return new Blob([bytes], {type:'image/avif'});
}
