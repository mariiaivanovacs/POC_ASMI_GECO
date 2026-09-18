import type { Doc, Template } from '../data/types';
import { assemble } from './assemble';

// ---------------------------------------------------------------------------
// SHA-256 (synchronous, so the seal check runs inside the same render as the document)
// ---------------------------------------------------------------------------
const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;
  const words = new Uint32Array(((len + 9 + 63) >> 6) << 4);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = len * 8;
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t];
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------------------------------------------------------------------------
// The seal: a hash over exactly what was signed — template, every included line, signer and time.
// Changing one character of the document afterwards breaks it. It is an integrity seal, not a PKI signature.
// ---------------------------------------------------------------------------
type Tpl = Pick<Template, 'id' | 'fields' | 'sections' | 'regimeShort' | 'name'>;

export function sealPayload(t: Tpl, values: Record<string, string>, signer: string, signedAt: string): string {
  return ['helmdocs-seal-v1', t.id, assemble(t, values).text, signer, signedAt].join('\n␞\n');
}

export function makeSeal(t: Tpl, values: Record<string, string>, signer: string, signedAt: string): string {
  return sha256(sealPayload(t, values, signer, signedAt));
}

export type SealState = 'none' | 'valid' | 'broken';
export function verifySeal(t: Tpl | null, doc: Pick<Doc, 'values' | 'signature'>): SealState {
  if (!doc.signature) return 'none';
  if (!t) return 'broken';
  return makeSeal(t, doc.values, doc.signature.signer, doc.signature.signedAt) === doc.signature.hash ? 'valid' : 'broken';
}

export function shortHash(h: string): string { return h.slice(0, 8) + '…' + h.slice(-4); }

// ---------------------------------------------------------------------------
// Signature images (browser only — canvas)
// ---------------------------------------------------------------------------
export const SIGNATURE_FONT = 'italic 600 46px "Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive';

/** Render a typed name as a handwriting-style transparent PNG. */
export function typedSignature(name: string): string {
  const c = document.createElement('canvas');
  c.width = 520; c.height = 140;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.font = SIGNATURE_FONT;
  ctx.fillStyle = '#1e2b45';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 20, 74, 480);
  return trimCanvas(c).toDataURL('image/png');
}

/** Crop transparent margins so the image sits tight on the signature line. */
export function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (data[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return c; // empty
  const pad = 8;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1 + pad * 2; out.height = y1 - y0 + 1 + pad * 2;
  out.getContext('2d')!.drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Load an uploaded image; optionally make near-white pixels transparent (a scanned signature on paper). */
export function loadSignatureImage(file: File, removeWhite: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { reject(new Error('Upload a PNG, JPEG, WebP or GIF image of your signature.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / img.width, 220 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (removeWhite) {
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) { const lum = (d[i] + d[i + 1] + d[i + 2]) / 3; if (lum > 225) d[i + 3] = 0; else if (lum > 170) d[i + 3] = Math.round(d[i + 3] * (225 - lum) / 55); }
        ctx.putImageData(id, 0, 0);
      }
      URL.revokeObjectURL(url);
      resolve(trimCanvas(c).toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
