/**
 * Approximate animation of each effect on a drawn keyboard. Timing comes from the firmware
 * speed value: period(s) = value × factor; the effect restarts whenever settings change.
 */
import { LAYOUT } from '../../devices/azoth/keys';
import { effectById, settingsOf, type ColorStop, type LightingState } from '../../devices/azoth/lighting';
import { QUICKSAND_DEFAULT } from '../../devices/azoth/lighting';
import { rgb } from '../../util/bytes';

type RGB = number[];
const PERIOD_FACTOR: Record<number, number> = { 1: 0.2, 2: 0.4, 3: 0.06, 4: 0.14, 5: 0.03, 6: 0.24, 7: 0.6, 8: 0.3, 9: 0.16 };

export interface KeyRect {
  name: string;
  x: number;
  y: number;
  w: number;
  cx: number;
  cy: number;
}
export const KEY_RECTS: KeyRect[] = LAYOUT.flatMap((row, y) => {
  let x = 0;
  return row.map(([name, w]) => {
    const k = { name, x, y, w, cx: (x + w / 2) / 15.5, cy: (y + 0.5) / 6 };
    x += w;
    return k;
  });
});

export interface Press {
  key: number;
  at: number;
}

const seeds = KEY_RECTS.map((_, i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1);
const lerp = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t);

const hueCache = new Map<number, RGB>();
function hue(h: number): RGB {
  const k = Math.round(((h % 360) + 360) % 360);
  let c = hueCache.get(k);
  if (!c) {
    // HSL(h, 95%, 55%) → RGB
    const s = 0.95, l = 0.55, a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const t = (n + k / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1))));
    };
    c = [f(0), f(8), f(4)];
    hueCache.set(k, c);
  }
  return c;
}

function gradientAt(stops: ColorStop[], t: number): RGB {
  const p = (((t % 1) + 1) % 1) * 100;
  if (!stops.length) return [0, 0, 0];
  if (p <= stops[0].p) return rgb(stops[0].c);
  for (let i = 0; i < stops.length - 1; i++)
    if (p <= stops[i + 1].p) return lerp(rgb(stops[i].c), rgb(stops[i + 1].c), (p - stops[i].p) / Math.max(1, stops[i + 1].p - stops[i].p));
  return rgb(stops[stops.length - 1].c);
}

const projection = (d: number, cx: number, cy: number): number =>
  [cx, (cx + cy) / 2, cy, (cy - cx + 1) / 2, 1 - cx, 1 - (cx + cy) / 2, 1 - cy, (cx - cy + 1) / 2][d % 8];

/** Speed-derived period of the current effect in ms. */
export function effectPeriodMs(state: LightingState): number {
  const def = effectById(state.effect);
  const s = settingsOf(state);
  return def.speeds ? def.speeds[s.speed] * PERIOD_FACTOR[def.id] * 1000 : 1000;
}

export function drawKeyboardFrame(ctx: CanvasRenderingContext2D, state: LightingState, elapsedMs: number, now: number, presses: Press[]): void {
  const { width: W, height: H } = ctx.canvas;
  const def = effectById(state.effect);
  const s = settingsOf(state);
  const period = effectPeriodMs(state);
  const p = elapsedMs / period; // cycles since restart
  const U = Math.min(W / 15.8, H / 6.3);
  const ox = (W - 15.5 * U) / 2;
  const oy = (H - 6 * U) / 2;
  const black: RGB = [0, 0, 0];
  const bg: RGB = def.background && s.bgOn ? rgb(s.bg ?? '#000000') : black;
  const mode = def.colors === 'sdr' ? s.colorMode : 'single';
  const c1: RGB = rgb(def.colors === 'one' ? (s.color ?? '#ff0000') : mode === 'double' ? (s.double?.[0] ?? '#ff0000') : (s.single ?? '#ff0000'));
  const c2: RGB = mode === 'double' ? rgb(s.double?.[1] ?? '#ff00ff') : c1;
  const rnd = mode === 'random';
  const width = (s.width ?? 1) + 1;
  const stops = s.stops ?? [];
  const six = s.six ?? [...QUICKSAND_DEFAULT];

  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, W, H);
  KEY_RECTS.forEach((k, i) => {
    let col: RGB = black;
    switch (def.id) {
      case 0:
        col = c1;
        break;
      case 1: {
        const n = Math.floor(p);
        const a = Math.sin(Math.PI * (p - n)) ** 2;
        const base = rnd ? hue(n * 67) : mode === 'double' && n % 2 ? c2 : c1;
        col = base.map((v) => v * a);
        break;
      }
      case 2:
        col = hue(p * 360); // starts at red like the keyboard
        break;
      case 3: {
        let best = 0;
        for (const q of presses) if (q.key === i) best = Math.max(best, 1 - (now - q.at) / period);
        if (best <= 0) { col = bg; break; }
        const base = rnd ? hue(seeds[i] * 360) : c1;
        const f = 1 - best;
        col = mode === 'double' ? (f < 0.5 ? lerp(base, c2, f * 2) : lerp(c2, bg, (f - 0.5) * 2)) : lerp(base, bg, f);
        break;
      }
      case 4: {
        const d = s.dir ?? 0;
        const proj = d < 8 ? projection(d, k.cx, k.cy) : -Math.hypot(k.cx - 0.5, (k.cy - 0.5) * 0.4);
        col = gradientAt(stops, proj * (1.2 / width) - p);
        break;
      }
      case 5: {
        col = bg;
        for (const q of presses) {
          const o = KEY_RECTS[q.key];
          const r = Math.hypot(k.cx - o.cx, (k.cy - o.cy) * 0.4);
          const front = ((now - q.at) / period) * 0.9;
          const band = 0.035 * width;
          if (Math.abs(r - front) < band) {
            const a = 1 - Math.abs(r - front) / band;
            const base = s.random ? hue(r * 700 + q.key * 40) : gradientAt(stops, r * 1.4);
            col = col.map((v, kk) => Math.max(v, base[kk] * a));
          }
        }
        break;
      }
      case 6: {
        const f = (p + seeds[i] * 3) % 3;
        const a = f < 1 ? Math.sin(Math.PI * f) : 0;
        const base = rnd ? hue(seeds[i] * 360 + Math.floor((p + seeds[i] * 3) / 3) * 90) : seeds[i] > 1.5 ? c2 : c1;
        col = lerp(bg, base, a);
        break;
      }
      case 7: {
        const v = (((projection(s.dir ?? 6, k.cx, k.cy) - p) % 1) + 1) % 1;
        col = s.random ? hue(v * 360) : rgb(six[Math.floor(v * 6) % 6]);
        break;
      }
      case 8: {
        const off = seeds[k.y * 3] * 2;
        const f = (((k.cx - (p + off)) % 1) + 1) % 1;
        const a = f < 0.12 ? 1 - f / 0.12 : 0;
        const base = rnd ? hue(k.y * 60 + Math.floor(p + off) * 50) : k.y % 2 ? c2 : c1;
        col = lerp(bg, base, a);
        break;
      }
      case 9: {
        const seed = seeds[Math.round(k.cx * 30) % seeds.length];
        const f = (((p + seed * 4 - k.cy) % 2) + 2) % 2;
        const a = f < 0.35 ? 1 - f / 0.35 : 0;
        col = lerp(bg, rnd ? hue(seed * 360) : seed > 1.5 ? c2 : c1, a);
        break;
      }
    }
    const b = 0.15 + (0.85 * s.bright) / 100;
    ctx.fillStyle = `rgb(${col.map((v) => Math.round(v * b)).join(',')})`;
    const x = ox + k.x * U;
    const y = oy + k.y * U;
    const g = Math.max(2, U * 0.07);
    ctx.beginPath();
    ctx.roundRect(x + g, y + g, k.w * U - 2 * g, U - 2 * g, U * 0.12);
    ctx.fill();
  });
}
