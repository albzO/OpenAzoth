/**
 * Minimal GIF89a encoder for 16-level grey frames (the OLED's own format), so an edited
 * composition can be downloaded, kept in the image library and re-opened like any other GIF.
 * Palette index = grey level (0–15 → 0x00, 0x11 … 0xFF). GIF delays are in 1/100 s.
 */
import type { GreyFrame } from './gray4';

class ByteWriter {
  private buf = new Uint8Array(4096);
  length = 0;
  byte(b: number): void {
    if (this.length === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.length++] = b & 0xff;
  }
  u16(v: number): void {
    this.byte(v);
    this.byte(v >> 8);
  }
  bytes(list: ArrayLike<number>): void {
    for (let i = 0; i < list.length; i++) this.byte(list[i]);
  }
  ascii(s: string): void {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  result(): Uint8Array<ArrayBuffer> {
    return this.buf.slice(0, this.length);
  }
}

const MIN_CODE_SIZE = 4; // 16 colours
const MAX_CODE = 4096;

/** LZW-compress palette indices (each < 16) into GIF image data sub-blocks. */
function lzwEncode(pixels: ArrayLike<number>, out: ByteWriter): void {
  const clear = 1 << MIN_CODE_SIZE;
  const eoi = clear + 1;
  let codeSize = MIN_CODE_SIZE + 1;
  let next = eoi + 1;
  const dict = new Map<number, number>();

  const block: number[] = [];
  let acc = 0;
  let bits = 0;
  const flushBlock = () => {
    out.byte(block.length);
    out.bytes(block);
    block.length = 0;
  };
  const emit = (code: number) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      block.push(acc & 0xff);
      if (block.length === 255) flushBlock();
      acc >>>= 8;
      bits -= 8;
    }
  };

  out.byte(MIN_CODE_SIZE);
  emit(clear);
  let prefix = pixels[0] ?? 0;
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 4) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < MAX_CODE) {
      dict.set(key, next++);
      // the decoder widens its codes once its table reaches 2^codeSize entries
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict.clear();
      next = eoi + 1;
      codeSize = MIN_CODE_SIZE + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) {
    block.push(acc & 0xff);
    if (block.length === 255) flushBlock();
  }
  if (block.length) flushBlock();
  out.byte(0); // block terminator
}

/** Encode frames (one level 0–15 per pixel) as a looping GIF. */
export function encodeGreyGif(frames: GreyFrame[], width: number, height: number): Uint8Array<ArrayBuffer> {
  const w = new ByteWriter();
  w.ascii('GIF89a');
  w.u16(width);
  w.u16(height);
  w.byte(0xb3); // global colour table, 4-bit colour resolution, 16 entries
  w.byte(0);
  w.byte(0);
  for (let i = 0; i < 16; i++) w.bytes([i * 17, i * 17, i * 17]);
  if (frames.length > 1) {
    w.bytes([0x21, 0xff, 0x0b]);
    w.ascii('NETSCAPE2.0');
    w.bytes([0x03, 0x01, 0x00, 0x00, 0x00]); // loop forever
  }
  for (const f of frames) {
    w.bytes([0x21, 0xf9, 0x04, 0x04]); // graphic control: dispose = leave in place, no transparency
    w.u16(Math.max(2, Math.round(f.ms / 10)));
    w.bytes([0x00, 0x00]);
    w.byte(0x2c);
    w.u16(0);
    w.u16(0);
    w.u16(width);
    w.u16(height);
    w.byte(0);
    lzwEncode(f.levels, w);
  }
  w.byte(0x3b);
  return w.result();
}
