/**
 * Render banner text the way the vendor tool does: white on black, drawn from the top-left,
 * explicit line breaks only, line pitch 1.5 × font size.
 *   layout 0 自动换行: 208 wide, grows downward (≤ 317)
 *   layout 1 单行:     46 high, grows to the right (≤ 1436)
 */
import { BANNER_H, BANNER_MAX_H, BANNER_MAX_W, OLED_W } from '../devices/azoth/oled';
import { toLevels } from './gray4';

export const BANNER_FONTS = ['ROG Fonts', 'Arial', 'Segoe UI', 'Microsoft YaHei', 'SimHei', 'Impact', 'Consolas', 'Georgia', 'Courier New', 'Bahnschrift'];
export const BANNER_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40];
/** values follow the vendor tool: 0 regular, 1 bold, 2 italic, 4 underline, 8 strikeout */
export const BANNER_STYLES = [0, 1, 2, 4, 8] as const;
/** 0 = wrap lines (grows down), 1 = single line (grows right) */
export const BANNER_LAYOUTS = [0, 1] as const;

export interface BannerSettings {
  pattern: number;
  text: string;
  font: string;
  style: number;
  size: number;
  layout: number;
}

export interface RenderedBanner {
  w: number;
  h: number;
  levels: Uint8Array;
  canvas: OffscreenCanvas;
  /** characters were dropped because the text exceeded the maximum size */
  clipped: boolean;
}

export const bannerFont = (b: BannerSettings): string =>
  `${b.style === 2 ? 'italic ' : ''}${b.style === 1 ? 'bold ' : ''}${b.size}px "${b.font}", sans-serif`;

export function renderBanner(b: BannerSettings): RenderedBanner {
  const font = bannerFont(b);
  const measure = new OffscreenCanvas(8, 8).getContext('2d')!;
  measure.font = font;
  const lines = (b.text || '').split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) lines.push(' ');
  const pitch = Math.round(b.size * 1.5);
  const maxLineW = b.layout === 1 ? BANNER_MAX_W : OLED_W;
  let clipped = false;
  const fitted = lines.map((l) => {
    let t = l;
    while (t.length && measure.measureText(t).width + 5 >= maxLineW) {
      t = t.slice(0, -1);
      clipped = true;
    }
    return t;
  });

  let w = OLED_W;
  let h = BANNER_H;
  if (b.layout === 1) {
    w = Math.max(OLED_W, ...fitted.map((l) => Math.ceil(measure.measureText(l).width)));
    w = Math.min(BANNER_MAX_W, w - (w & 1));
  } else {
    h = Math.max(BANNER_H, (fitted.length - 1) * pitch + Math.ceil(b.size * 1.2));
    if (h > BANNER_MAX_H) {
      h = BANNER_MAX_H;
      clipped = true;
    }
    h -= h & 1;
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.font = font;
  ctx.textBaseline = 'top';
  fitted.forEach((l, i) => {
    const y = i * pitch;
    ctx.fillText(l, 0, y);
    if (b.style === 4 || b.style === 8) {
      const lw = measure.measureText(l).width;
      const ly = Math.round(y + (b.style === 4 ? b.size * 1.05 : b.size * 0.55)) + 0.5;
      ctx.lineWidth = Math.max(1, Math.round(b.size / 14));
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(lw, ly);
      ctx.stroke();
    }
  });
  return { w, h, levels: toLevels(ctx.getImageData(0, 0, w, h).data, w * h), canvas, clipped };
}
