import { describe, expect, it } from 'vitest';
import { encodeGreyGif } from '../src/media/gif';
import { frameAt, frameStep, layerCorners, mergeRepeats, toLayerSpace } from '../src/media/compose';

/** Reference GIF decoder (first frame / all frames), written from the GIF89a spec. */
function decodeGif(b: Uint8Array): { w: number; h: number; frames: { delay: number; px: number[] }[] } {
  const u16 = (o: number) => b[o] | (b[o + 1] << 8);
  expect(String.fromCharCode(...b.subarray(0, 6))).toBe('GIF89a');
  const w = u16(6);
  const h = u16(8);
  let o = 13 + 3 * (2 << (b[10] & 7));
  const frames: { delay: number; px: number[] }[] = [];
  let delay = 0;
  while (b[o] !== 0x3b) {
    if (b[o] === 0x21) {
      if (b[o + 1] === 0xf9) delay = u16(o + 4);
      o += 2;
      while (b[o]) o += b[o] + 1;
      o++;
      continue;
    }
    expect(b[o]).toBe(0x2c);
    o += 10;
    const min = b[o++];
    const data: number[] = [];
    while (b[o]) {
      data.push(...b.subarray(o + 1, o + 1 + b[o]));
      o += b[o] + 1;
    }
    o++;
    // LZW decode
    const clear = 1 << min;
    let size = min + 1;
    let dict: number[][] = [];
    const reset = () => {
      dict = Array.from({ length: clear + 2 }, (_, i) => [i]);
      size = min + 1;
    };
    reset();
    const px: number[] = [];
    let bit = 0;
    let prev: number[] | null = null;
    for (;;) {
      let code = 0;
      for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
      if (code === clear) {
        reset();
        prev = null;
        continue;
      }
      if (code === clear + 1) break;
      let entry: number[];
      if (code < dict.length) entry = dict[code];
      else entry = [...prev!, prev![0]];
      px.push(...entry);
      if (prev && dict.length < 4096) dict.push([...prev, entry[0]]);
      if (dict.length === 1 << size && size < 12) size++;
      prev = entry;
    }
    frames.push({ delay, px });
  }
  return { w, h, frames };
}

describe('GIF encoder', () => {
  it('round-trips 16-level frames, including long runs and noise', () => {
    const n = 208 * 64;
    const noise = Uint8Array.from({ length: n }, (_, i) => (i * 7919 + (i >> 5) * 31) % 16);
    const flat = new Uint8Array(n).fill(9);
    const grad = Uint8Array.from({ length: n }, (_, i) => (i % 208) >> 4);
    const gif = encodeGreyGif(
      [
        { levels: noise, ms: 100 },
        { levels: flat, ms: 40 },
        { levels: grad, ms: 1230 },
      ],
      208,
      64,
    );
    const d = decodeGif(gif);
    expect([d.w, d.h]).toEqual([208, 64]);
    expect(d.frames.map((f) => f.delay)).toEqual([10, 4, 123]);
    expect(d.frames[0].px).toEqual(Array.from(noise));
    expect(d.frames[1].px).toEqual(Array.from(flat));
    expect(d.frames[2].px).toEqual(Array.from(grad));
  });
});

describe('editor timeline', () => {
  const frames = [{ ms: 100 }, { ms: 50 }, { ms: 150 }];
  const timing = { start: 200, length: 1000, trimIn: 0, speed: 1 };

  it('is hidden outside its time range', () => {
    expect(frameAt(frames, timing, 199)).toBeNull();
    expect(frameAt(frames, timing, 1200)).toBeNull();
  });
  it('plays its own frames and loops', () => {
    expect(frameAt(frames, timing, 200)).toBe(0);
    expect(frameAt(frames, timing, 300)).toBe(1);
    expect(frameAt(frames, timing, 350)).toBe(2);
    expect(frameAt(frames, timing, 500)).toBe(0); // 300 ms loop
  });
  it('honours trim and speed', () => {
    expect(frameAt(frames, { ...timing, trimIn: 100 }, 200)).toBe(1);
    expect(frameAt(frames, { ...timing, speed: 2 }, 250)).toBe(1);
  });
  it('fits the duration into the frame limit in 10 ms steps', () => {
    expect(frameStep(1000, 50)).toEqual({ step: 50, count: 20 });
    expect(frameStep(20000, 50)).toEqual({ step: 110, count: 182 });
    expect(frameStep(100, 5)).toEqual({ step: 20, count: 5 });
  });
  it('merges identical neighbouring frames', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const m = mergeRepeats([
      { levels: a, ms: 50 },
      { levels: a.slice(), ms: 50 },
      { levels: b, ms: 50 },
    ]);
    expect(m.map((f) => f.ms)).toEqual([100, 50]);
  });
  it('maps points into a rotated, scaled layer', () => {
    const l = { x: 10, y: 0, scale: 2, rotation: 90 };
    // layer centre is at (114, 32); one source px right of centre is 2 OLED px down after 90°
    const p = toLayerSpace(l, 114, 34);
    expect(p.u).toBeCloseTo(1);
    expect(p.v).toBeCloseTo(0);
    const c = layerCorners({ x: 0, y: 0, scale: 1, rotation: 0 }, 208, 64);
    expect(c[0]).toEqual([0, 0]);
    expect(c[2]).toEqual([208, 64]);
  });
});
