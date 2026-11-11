/** OLED commands and image/banner geometry (208×64, 16-level grey). */
import type { UploadSpec } from '../../hid/upload';

export const OLED_W = 208;
export const OLED_H = 64;
export const MAX_FRAMES = 196;
export const FRAME_BYTES = (OLED_W * OLED_H) / 2;

/** Banner: firmware draws an 18 px pattern strip on top; our text image goes underneath. */
export const BANNER_STRIP_H = 18;
export const BANNER_H = OLED_H - BANNER_STRIP_H; // 46
export const BANNER_MAX_W = OLED_W * 7 - 20; // single line
export const BANNER_MAX_H = BANNER_H * 7 - 5; // wrapped
/** banner pattern indices 0–4 (names: i18n pattern.<i>) */
export const BANNER_PATTERN_COUNT = 5;
export const PRESET_COUNT = 6;

export const oledPowerCmd = (on: boolean): number[] => [0x69, 0x00, 0x00, 0x00, on ? 1 : 0];
/** firmware rounds up to the nearest 25 */
export const oledBrightnessCmd = (pct: number): number[] => [0x68, 0x00, 0x00, 0x00, pct];
export const oledPresetCmd = (index: number): number[] => [0x61, 0x00, 0x00, 0x00, index];

/** 63: set the clock and show it. 12 h format sends 1 (AM) / 2 (PM) and a 12 h hour. */
export function oledClockCmd(now: Date, use24h: boolean): number[] {
  let hour = now.getHours();
  let format = 0;
  if (!use24h) {
    format = hour < 12 ? 1 : 2;
    if (hour > 12) hour -= 12;
  }
  const y = now.getFullYear();
  return [0x63, 0x00, 0x00, 0x00, format, y & 0xff, y >> 8, now.getMonth() + 1, now.getDate(), hour, now.getMinutes()];
}

/** 61 01 <n u32> / 61 02 … / 61 03 */
export const IMAGE_UPLOAD: UploadSpec = {
  begin: (n) => [0x61, 0x01, 0, 0, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24],
  data: [0x61, 0x02],
  show: [0x61, 0x03],
};

/** 62 00 00 00 <pattern> <layout> <w u16> <h u16> <n u16> / 62 01 … / 62 02 */
export const bannerUpload = (pattern: number, layout: number, w: number, h: number): UploadSpec => ({
  begin: (n) => [0x62, 0x00, 0, 0, pattern, layout, w & 0xff, w >> 8, h & 0xff, h >> 8, n & 0xff, n >> 8],
  data: [0x62, 0x01],
  show: [0x62, 0x02],
});

/** What the OLED is showing, as far as the app knows. */
export type OledContent =
  | { kind: 'preset'; index: number }
  | { kind: 'image' | 'banner' | 'clock' }
  | { kind: 'unknown'; code: number };

/** 21 00 reports 0–5 for presets and 6 for an uploaded image. */
export const oledContentFromCode = (v: number): OledContent =>
  v < PRESET_COUNT ? { kind: 'preset', index: v } : v === 6 ? { kind: 'image' } : { kind: 'unknown', code: v };
