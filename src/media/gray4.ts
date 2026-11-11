/**
 * 16-level grey conversion and the OLED image binary format.
 *   still image:   01 00 E8 03 + frame
 *   animation:     <frames u16> <ms u16 × frames> + frames
 *   frame:         208×64, 2 pixels per byte, LEFT pixel in the LOW nibble, rows top→bottom
 */
import { FRAME_BYTES, MAX_FRAMES, OLED_H, OLED_W } from '../devices/azoth/oled';

export type FitMode = 'crop' | 'fit' | 'stretch';

export interface GreyFrame {
  /** one 0–15 level per pixel */
  levels: Uint8Array;
  ms: number;
}

/** RGBA pixels → 0–15 levels (luma, optional gamma and invert). */
export function toLevels(rgba: ArrayLike<number>, count: number, invert = false, gamma = 1): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    let y = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) / 255;
    if (gamma !== 1) y = Math.pow(y, gamma);
    if (invert) y = 1 - y;
    out[i] = Math.round(y * 15);
  }
  return out;
}

/** Pack levels two per byte (left pixel low nibble) into out starting at offset; returns the end offset. */
export function pack4(levels: ArrayLike<number>, out: Uint8Array, offset = 0): number {
  let o = offset;
  for (let i = 0; i < levels.length; i += 2) out[o++] = ((levels[i + 1] ?? 0) << 4) | levels[i];
  return o;
}

export function imageBinary(frames: GreyFrame[], animated: boolean): Uint8Array {
  const header = animated
    ? [frames.length & 0xff, frames.length >> 8, ...frames.flatMap((f) => [f.ms & 0xff, f.ms >> 8])]
    : [1, 0, 0xe8, 0x03];
  const out = new Uint8Array(header.length + frames.length * FRAME_BYTES);
  out.set(header);
  let o = header.length;
  for (const f of frames) o = pack4(f.levels, out, o);
  return out;
}

/** Keep at most `max` frames, sampling uniformly and folding dropped frames' time into the kept ones. */
export function sampleFrames<T extends { ms: number }>(frames: T[], max = MAX_FRAMES): T[] {
  if (frames.length <= max) return frames;
  const step = frames.length / max;
  const picked: T[] = [];
  for (let i = 0; i < max; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(Math.floor((i + 1) * step), a + 1);
    picked.push({ ...frames[a], ms: frames.slice(a, b).reduce((s, f) => s + f.ms, 0) });
  }
  return picked;
}

export const clampMs = (ms: number): number => Math.max(1, Math.min(0xffff, Math.round(ms)));

/**
 * Where the source image sits on the 208×64 screen:
 *   stretch — squashed to fill exactly
 *   free    — uniform `scale` (screen px per source px), centre offset (x, y) in screen px from the screen centre
 */
export type Placement = { kind: 'stretch' } | { kind: 'free'; scale: number; x: number; y: number };

interface Sized {
  width: number;
  height: number;
}

/** Scale that fills the screen (crop) or fits inside it (fit). */
export const coverScale = (img: Sized): number => Math.max(OLED_W / img.width, OLED_H / img.height);
export const containScale = (img: Sized): number => Math.min(OLED_W / img.width, OLED_H / img.height);

/** Starting placement for a fit preset, centred. */
export function presetPlacement(img: Sized, mode: FitMode): Placement {
  if (mode === 'stretch') return { kind: 'stretch' };
  return { kind: 'free', scale: mode === 'crop' ? coverScale(img) : containScale(img), x: 0, y: 0 };
}

/** Destination rectangle of the image on the screen. */
export function placedRect(img: Sized, p: Placement): { x: number; y: number; w: number; h: number } {
  if (p.kind === 'stretch') return { x: 0, y: 0, w: OLED_W, h: OLED_H };
  const w = img.width * p.scale;
  const h = img.height * p.scale;
  return { x: (OLED_W - w) / 2 + p.x, y: (OLED_H - h) / 2 + p.y, w, h };
}

/** Zoom by `factor` about the screen centre (keeps what's in the middle in the middle). */
export function zoomPlacement(p: Placement, factor: number): Placement {
  if (p.kind === 'stretch') return p;
  return { kind: 'free', scale: p.scale * factor, x: p.x * factor, y: p.y * factor };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draw an image onto a 208×64 context at the given placement (black background). */
export function drawPlaced(ctx: Ctx2D, img: CanvasImageSource & Sized, p: Placement): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OLED_W, OLED_H);
  const r = placedRect(img, p);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
}
