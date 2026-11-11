/**
 * Drawing for the OLED preview: banner pattern strips, clock, placeholders.
 * Original vendor artwork is NOT shipped. If a developer runs tools/fetch_rog_banners.py locally,
 * the files land in public/rog-assets/ (git-ignored) and are used for a faithful preview.
 */
import { signal } from '@preact/signals';
import { OLED_H, OLED_W, PRESET_COUNT, BANNER_PATTERN_COUNT } from '../../devices/azoth/oled';
import { decodeImage, type DecodedFrame } from '../../media/decode';

export const assetUrl = (name: string): string => `${import.meta.env.BASE_URL}rog-assets/${name}`;

/** bumps when optional local artwork finishes loading, so previews re-render */
export const artRevision = signal(0);

const patternImages = Array.from({ length: BANNER_PATTERN_COUNT }, (_, i) => {
  const img = new Image();
  img.onload = () => artRevision.value++;
  img.src = assetUrl(`banner-${i}.png`);
  return img;
});
export const hasPatternArt = (): boolean => patternImages.every((im) => im.complete && im.naturalWidth > 0);

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draw banner pattern `type` into a w×h area (original art if available, else an approximation). */
export function drawPattern(ctx: Ctx, type: number, w: number, h: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const im = patternImages[type];
  if (im?.complete && im.naturalWidth) {
    ctx.drawImage(im, 0, 0, w, h);
    return;
  }
  ctx.fillStyle = '#bbb';
  const slash = (x: number) => {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h * 0.6, 0);
    ctx.lineTo(x + h * 0.6 + 2, 0);
    ctx.lineTo(x + 2, h);
    ctx.fill();
  };
  if (type === 0) for (let x = -h; x < w; x += 8) slash(x);
  if (type === 3) for (let y = 0; y < h; y += 4) for (let x = ((y / 4) % 2) * 4; x < w; x += 8) ctx.fillRect(x, y, 4, 4);
  if (type === 4)
    for (let x = 0; x < w; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 1);
      ctx.lineTo(x + 5, h / 2);
      ctx.lineTo(x, h - 1);
      ctx.lineTo(x + 3, h - 1);
      ctx.lineTo(x + 8, h / 2);
      ctx.lineTo(x + 3, 1);
      ctx.fill();
    }
  if (type === 1 || type === 2) {
    ctx.font = `bold ${Math.round(h * 0.8)}px sans-serif`;
    ctx.textBaseline = 'middle';
    for (let x = 0; x < w; x += type === 1 ? 60 : 34) {
      ctx.fillText('ROG', x + 2, h / 2 + 1);
      if (type === 1) for (let k = 0; k < 4; k++) slash(x + 30 + k * 6);
    }
    ctx.textBaseline = 'alphabetic';
  }
}

export function drawMessage(ctx: Ctx, text: string, color = '#555', font = '10px sans-serif'): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OLED_W, OLED_H);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(text, OLED_W / 2, 37);
  ctx.textAlign = 'left';
}

/** Approximate look of the firmware clock screen. */
export function drawClock(ctx: Ctx, use24h: boolean, now = new Date()): void {
  let h = now.getHours();
  const ampm = h < 12 ? 'AM' : 'PM';
  if (!use24h) h = h % 12 || 12;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OLED_W, OLED_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eee';
  ctx.font = 'bold 28px Consolas, monospace';
  ctx.fillText(`${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}${use24h ? '' : ' ' + ampm}`, OLED_W / 2, 34);
  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.fillText(now.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }), OLED_W / 2, 54);
  ctx.textAlign = 'left';
}

// ---- preset animations (optional local artwork)
const presetCache: (Promise<DecodedFrame[] | null> | undefined)[] = Array(PRESET_COUNT);
export function loadPresetFrames(i: number): Promise<DecodedFrame[] | null> {
  presetCache[i] ??= fetch(assetUrl(`preset-${i}.gif`))
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('image') ? r.blob() : null))
    .then((b) => (b ? decodeImage(new Blob([b], { type: 'image/gif' })).then((d) => d.frames) : null))
    .catch(() => null);
  return presetCache[i]!;
}
