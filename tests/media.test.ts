import { describe, expect, it } from 'vitest';
import { imageBinary, pack4, placedRect, presetPlacement, sampleFrames, toLevels, zoomPlacement } from '../src/media/gray4';
import { FRAME_BYTES } from '../src/devices/azoth/oled';

describe('16-level grey', () => {
  it('maps black/white to 0/15 and can invert', () => {
    const rgba = [0, 0, 0, 255, 255, 255, 255, 255];
    expect(Array.from(toLevels(rgba, 2))).toEqual([0, 15]);
    expect(Array.from(toLevels(rgba, 2, true))).toEqual([15, 0]);
  });
  it('packs the left pixel into the low nibble', () => {
    const out = new Uint8Array(1);
    pack4([1, 2], out);
    expect(out[0]).toBe(0x21);
  });
});

describe('image placement', () => {
  const img = { width: 416, height: 416 }; // square source on a 208×64 screen
  it('crop fills the screen, fit shows it all, both centred', () => {
    expect(placedRect(img, presetPlacement(img, 'crop'))).toEqual({ x: 0, y: -72, w: 208, h: 208 });
    expect(placedRect(img, presetPlacement(img, 'fit'))).toEqual({ x: 72, y: 0, w: 64, h: 64 });
    expect(placedRect(img, presetPlacement(img, 'stretch'))).toEqual({ x: 0, y: 0, w: 208, h: 64 });
  });
  it('dragging moves the image, zoom keeps the screen centre fixed', () => {
    const moved = { kind: 'free' as const, scale: 0.5, x: 10, y: -5 };
    expect(placedRect(img, moved)).toEqual({ x: 10, y: -77, w: 208, h: 208 });
    const z = zoomPlacement(moved, 2);
    expect(z).toEqual({ kind: 'free', scale: 1, x: 20, y: -10 });
    // the source pixel at the screen centre stays at the screen centre
    const centreSrc = (p: typeof moved) => { const r = placedRect(img, p); return [(104 - r.x) / p.scale, (32 - r.y) / p.scale]; };
    expect(centreSrc(z as typeof moved)).toEqual(centreSrc(moved));
  });
});

describe('image binary', () => {
  const frame = (ms: number) => ({ levels: new Uint8Array(FRAME_BYTES * 2), ms });
  it('still image header is 01 00 E8 03', () => {
    const bin = imageBinary([frame(1000)], false);
    expect(Array.from(bin.slice(0, 4))).toEqual([1, 0, 0xe8, 3]);
    expect(bin.length).toBe(4 + FRAME_BYTES);
  });
  it('animation header lists frame count and per-frame ms', () => {
    const bin = imageBinary([frame(80), frame(300)], true);
    expect(Array.from(bin.slice(0, 6))).toEqual([2, 0, 80, 0, 0x2c, 1]);
    expect(bin.length).toBe(6 + 2 * FRAME_BYTES);
  });
  it('frame sampling keeps the total duration', () => {
    const frames = Array.from({ length: 500 }, () => ({ ms: 10 }));
    const s = sampleFrames(frames, 196);
    expect(s.length).toBe(196);
    expect(s.reduce((a, f) => a + f.ms, 0)).toBe(5000);
  });
});
