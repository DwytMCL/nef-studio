import { zlibSync } from 'fflate';

const encoder = new TextEncoder();
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function chunk(name, bytes) {
  const out = new Uint8Array(bytes.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, bytes.length);
  out.set(encoder.encode(name), 4);
  out.set(bytes, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < out.length - 4; i++) crc = crcTable[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  view.setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0);
  return out;
}
async function compress(bytes) {
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* Older browsers use the bundled compressor. */ }
  }
  return zlibSync(bytes, { level: 2 });
}
export async function encodePng({ width, height, colors, bits, data }) {
  if (!width || !height || colors < 3 || ![8, 16].includes(bits)) throw new Error('Unsupported decoded image.');
  const bps = bits / 8;
  const stride = width * 3 * bps;
  const scan = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    let dst = y * (stride + 1) + 1;
    let src = y * width * colors;
    for (let x = 0; x < width; x++, src += colors) {
      for (let c = 0; c < 3; c++) {
        const val = data[src + c];
        if (bits === 16) { scan[dst++] = val >>> 8; scan[dst++] = val & 255; }
        else scan[dst++] = val;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = bits;
  ihdr[9] = 2; // RGB
  const compressed = await compress(scan);
  return new Blob([signature, chunk('IHDR', ihdr), chunk('sRGB', new Uint8Array([0])), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())], { type: 'image/png' });
}

export function previewDataUrl({ width, height, colors, bits, data }) {
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', { alpha: false });
  const image = context.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const row = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const src = (row * width + Math.min(width - 1, Math.floor(x / scale))) * colors;
      const dst = (y * w + x) * 4;
      image.data[dst] = bits === 16 ? data[src] >>> 8 : data[src];
      image.data[dst + 1] = bits === 16 ? data[src + 1] >>> 8 : data[src + 1];
      image.data[dst + 2] = bits === 16 ? data[src + 2] >>> 8 : data[src + 2];
      image.data[dst + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}
