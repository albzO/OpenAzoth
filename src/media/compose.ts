/**
 * Layer composition for the OLED canvas editor.
 *
 * Each layer is an image or GIF placed on the 208×64 screen (centre offset, scale, rotation) and
 * placed on a timeline: visible from `start` for `length` ms, playing its own frames from `trimIn`
 * at `speed`, looping. Layers are converted to grey (gamma, invert) one by one and alpha-blended,
 * bottom layer first, then quantised to the OLED's 16 levels.
 */
import { MAX_FRAMES, OLED_H, OLED_W } from '../devices/azoth/oled';
import type { GreyFrame } from './gray4';

export interface Transform {
  /** centre offset from the screen centre, OLED px */
  x: number;
  y: number;
  /** OLED px per source px */
  scale: number;
  /** degrees, clockwise */
  rotation: number;
  /** mirror left↔right / top↔bottom (in the layer's own axes, before rotation) */
  flipX?: boolean;
  flipY?: boolean;
}

export interface Timing {
  start: number;
  length: number;
  /** where in the source the layer starts playing, ms */
  trimIn: number;
  speed: number;
}

export interface Adjust {
  opacity: number;
  gamma: number;
  invert: boolean;
  visible: boolean;
}

export interface SourceFrame {
  bitmap: CanvasImageSource & { width: number; height: number };
  ms: number;
}

export type ComposeLayer = Transform & Timing & Adjust & { frames: SourceFrame[] };

/** Total play time of a source (one loop). */
export const loopMs = (delays: readonly { ms: number }[]): number => delays.reduce((s, f) => s + f.ms, 0);

/** Which source frame a layer shows at timeline time t, or null when the layer isn't on screen. */
export function frameAt(frames: readonly { ms: number }[], timing: Timing, t: number): number | null {
  if (t < timing.start || t >= timing.start + timing.length) return null;
  if (frames.length <= 1) return 0;
  const total = loopMs(frames);
  if (total <= 0) return 0;
  let s = (timing.trimIn + (t - timing.start) * timing.speed) % total;
  if (s < 0) s += total;
  for (let i = 0; i < frames.length; i++) {
    if (s < frames[i].ms) return i;
    s -= frames[i].ms;
  }
  return frames.length - 1;
}

/**
 * Output frame step for a timeline: the requested interval, raised (in 10 ms steps, the GIF
 * resolution) so the whole duration fits in the keyboard's frame limit.
 */
export function frameStep(duration: number, interval: number, max = MAX_FRAMES): { step: number; count: number } {
  let step = Math.max(20, Math.round(interval / 10) * 10);
  const minStep = Math.ceil(duration / max / 10) * 10;
  if (step < minStep) step = minStep;
  const count = Math.max(1, Math.min(max, Math.round(duration / step)));
  return { step, count };
}

/** Merge consecutive identical frames (adding up their time), so still parts cost one frame. */
export function mergeRepeats(frames: GreyFrame[]): GreyFrame[] {
  const out: GreyFrame[] = [];
  for (const f of frames) {
    const prev = out[out.length - 1];
    if (prev && prev.ms + f.ms <= 0xffff && sameLevels(prev.levels, f.levels)) prev.ms += f.ms;
    else out.push({ levels: f.levels, ms: f.ms });
  }
  return out;
}

function sameLevels(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Map a point in OLED px into the layer's source px (centred), for hit testing. */
export function toLayerSpace(l: Transform, px: number, py: number): { u: number; v: number } {
  const dx = px - (OLED_W / 2 + l.x);
  const dy = py - (OLED_H / 2 + l.y);
  const r = (-l.rotation * Math.PI) / 180;
  return { u: (dx * Math.cos(r) - dy * Math.sin(r)) / l.scale, v: (dx * Math.sin(r) + dy * Math.cos(r)) / l.scale };
}

/** The four corners of a layer in OLED px (top-left, top-right, bottom-right, bottom-left). */
export function layerCorners(l: Transform, w: number, h: number): [number, number][] {
  const r = (l.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const cx = OLED_W / 2 + l.x;
  const cy = OLED_H / 2 + l.y;
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const).map(([u, v]) => [
    cx + (u * c - v * s) * l.scale,
    cy + (u * s + v * c) * l.scale,
  ]);
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Apply a layer's transform to a context whose unit is one OLED pixel. */
export function applyTransform(ctx: Ctx2D, l: Transform, w: number, h: number): void {
  ctx.translate(OLED_W / 2 + l.x, OLED_H / 2 + l.y);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale * (l.flipX ? -1 : 1), l.scale * (l.flipY ? -1 : 1));
  ctx.translate(-w / 2, -h / 2);
}

let scratch: OffscreenCanvasRenderingContext2D | null = null;
const gammaLuts = new Map<string, Float32Array>();
function lut(gamma: number, invert: boolean): Float32Array {
  const k = `${gamma}/${invert}`;
  let l = gammaLuts.get(k);
  if (!l) {
    l = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const y = Math.pow(i / 255, gamma);
      l[i] = invert ? 1 - y : y;
    }
    gammaLuts.set(k, l);
  }
  return l;
}

/** Composite all layers at timeline time t into 208×64 grey levels (0–15). Browser only. */
export function composeLevels(layers: readonly ComposeLayer[], t: number): Uint8Array {
  scratch ??= new OffscreenCanvas(OLED_W, OLED_H).getContext('2d', { willReadFrequently: true })!;
  const ctx = scratch;
  const n = OLED_W * OLED_H;
  const acc = new Float32Array(n);
  for (const l of layers) {
    if (!l.visible || l.opacity <= 0) continue;
    const fi = frameAt(l.frames, l, t);
    if (fi === null) continue;
    const bmp = l.frames[fi].bitmap;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, OLED_W, OLED_H);
    ctx.imageSmoothingQuality = 'high';
    applyTransform(ctx, l, bmp.width, bmp.height);
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, OLED_W, OLED_H).data;
    const g = lut(l.gamma, l.invert);
    for (let i = 0; i < n; i++) {
      const a = (px[i * 4 + 3] / 255) * l.opacity;
      if (a <= 0) continue;
      // canvas pixels are un-premultiplied, so the colour is the layer's own colour
      const y = g[Math.round(px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114)];
      acc[i] = acc[i] * (1 - a) + y * a;
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.min(1, Math.max(0, acc[i])) * 15);
  return out;
}

/** Render the whole timeline into OLED frames (identical neighbours merged). */
export function renderTimeline(layers: readonly ComposeLayer[], duration: number, interval: number): GreyFrame[] {
  const { step, count } = frameStep(duration, interval);
  const frames: GreyFrame[] = [];
  for (let i = 0; i < count; i++) frames.push({ levels: composeLevels(layers, i * step), ms: step });
  return mergeRepeats(frames);
}
