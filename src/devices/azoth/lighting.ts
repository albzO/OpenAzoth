/**
 * Lighting effects exactly as the vendor web page offers them for the Azoth:
 * same order, names, controls, value ranges, defaults and packet layout.
 *
 *   51 2C <effect> <chunk> <payload…>      then 50 55 to save
 */
import { rgb } from '../../util/bytes';

/** How the colour section of an effect works. */
export type ColorKind =
  | 'one' //   a single colour (恒亮)
  | 'sdr' //   单色 / 双色 / 随机
  | 'grad' //  gradient 样式, no random (彩虹)
  | 'gradR' // gradient 样式 / 随机 (涟漪)
  | 'qs' //    fixed six-stop gradient 样式 / 随机 (流沙)
  | 'none'; // no colour (彩色循环)

export interface EffectDef {
  /** firmware effect id; display names live in the i18n dictionaries (effect.<id>) */
  id: number;
  colors: ColorKind;
  /** firmware values for 慢 / 正常 / 快; null = no speed */
  speeds: readonly [number, number, number] | null;
  width?: boolean;
  background?: boolean;
  directions?: readonly number[];
}

/** In the order the vendor page lists them. */
export const EFFECTS: readonly EffectDef[] = [
  { id: 0, colors: 'one', speeds: null }, //                                   static
  { id: 1, colors: 'sdr', speeds: [42, 30, 15] }, //                           breathing
  { id: 2, colors: 'none', speeds: [62, 31, 18] }, //                          colour cycle
  { id: 4, colors: 'grad', speeds: [85, 62, 35], width: true, directions: [0, 1, 2, 3, 4, 5, 6, 7, 8] }, // rainbow
  { id: 5, colors: 'gradR', speeds: [120, 100, 80], width: true }, //          ripple
  { id: 3, colors: 'sdr', speeds: [22, 15, 8] }, //                            reactive
  { id: 6, colors: 'sdr', speeds: [25, 15, 10], background: true }, //         starry night
  { id: 7, colors: 'qs', speeds: [20, 15, 12], directions: [6, 2] }, //        quicksand (up / down only)
  { id: 8, colors: 'sdr', speeds: [12, 10, 7], background: true }, //          current
  { id: 9, colors: 'sdr', speeds: [27, 20, 14], background: true }, //         raindrop
];
export const effectById = (id: number): EffectDef => EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];

/** direction codes: 0–7 the eight compass directions, 8 = spread from centre */
export const DIRECTION_ARROW: Record<number, string> = { 0: '→', 1: '↘', 2: '↓', 3: '↙', 4: '←', 5: '↖', 6: '↑', 7: '↗', 8: '⇔' };

export interface ColorStop {
  /** "#rrggbb" */
  c: string;
  /** position 0–100 */
  p: number;
}

/** Preset gradient styles offered by the vendor page. */
export const PALETTES: readonly ColorStop[][] = [
  [[0.5, '#ff0029']],
  [[0.33, '#0018f0'], [0.66, '#ff0031']],
  [[0.25, '#febe3f'], [0.5, '#fe3f7d'], [0.75, '#f91d1d']],
  [[0.2, '#d1fe3f'], [0.4, '#00dcff'], [0.6, '#00dcff'], [0.8, '#d1fe3f']],
  [[0.16, '#f1ff00'], [0.33, '#ff00ed'], [0.5, '#f1ff00'], [0.66, '#ff00ed'], [0.83, '#f1ff00']],
  [[0.14, '#ff0091'], [0.28, '#8c00ff'], [0.42, '#4b00d9'], [0.57, '#4b00d9'], [0.71, '#8c00ff'], [0.85, '#ff0091']],
  [[0.12, '#f500ff'], [0.25, '#0006ff'], [0.37, '#00faff'], [0.5, '#01ff00'], [0.62, '#fff600'], [0.75, '#ff7807'], [0.87, '#ff000d']],
].map((pal) => (pal as [number, string][]).map(([o, c]) => ({ c, p: Math.round(o * 100) })));

export const MAX_STOPS = 7;
export const QUICKSAND_OFFSETS = [14, 28, 42, 57, 71, 85] as const;
export const QUICKSAND_DEFAULT = ['#fef600', '#01ff05', '#00e4ff', '#1105ff', '#f500ff', '#ff000e'] as const;

export type ColorMode = 'single' | 'double' | 'random';

/** Settings of one effect. Which fields matter depends on the effect's ColorKind. */
export interface EffectSettings {
  bright: number; //  0–100, step 5
  speed: number; //   0–2 index into EffectDef.speeds
  color?: string; //  'one'
  colorMode?: ColorMode; // 'sdr'
  single?: string;
  double?: [string, string];
  bgOn?: boolean; //  background (星空/电流/雨滴)
  bg?: string;
  stops?: ColorStop[]; // 'grad' / 'gradR'
  random?: boolean; //   'gradR' / 'qs'
  six?: string[]; //     'qs'
  width?: number; //     0–2
  dir?: number;
}

export interface LightingState {
  effect: number;
  /** every effect keeps its own settings, like the vendor page */
  fx: Record<number, EffectSettings>;
}

export function defaultEffectSettings(id: number): EffectSettings {
  const base = { bright: 50, speed: 1 };
  const sdr = { colorMode: 'single' as ColorMode, single: '#ff0000', double: ['#ff0000', '#ff00ff'] as [string, string] };
  switch (id) {
    case 0: return { bright: 50, speed: 1, color: '#ff0000' };
    case 2: return { ...base };
    case 4: return { ...base, width: 0, dir: 0, stops: PALETTES[6].map((s) => ({ ...s })) };
    case 5: return { ...base, width: 0, random: false, stops: PALETTES[6].map((s) => ({ ...s })) };
    case 7: return { ...base, random: false, dir: 6, six: [...QUICKSAND_DEFAULT] };
    case 6: case 8: case 9: return { ...base, ...sdr, bgOn: false, bg: '#000000' };
    default: return { ...base, ...sdr };
  }
}

export const defaultLighting = (): LightingState => ({
  effect: 0,
  fx: Object.fromEntries(EFFECTS.map((e) => [e.id, defaultEffectSettings(e.id)])),
});

export const settingsOf = (state: LightingState, id = state.effect): EffectSettings =>
  state.fx[id] ?? defaultEffectSettings(id);

/** Build the 51 2C packets for the selected effect (1–3 chunks, last chunk index 0). */
export function lightingPackets(state: LightingState): number[][] {
  const def = effectById(state.effect);
  const s = settingsOf(state);
  const speed = def.speeds ? def.speeds[s.speed] : 0xff;
  const head = (chunk: number) => [0x51, 0x2c, def.id, chunk];

  if (def.colors === 'grad' || def.colors === 'gradR') {
    // 3 chunks: up to 7 colour stops, each [location 0–100, r, g, b]; unused stops are ff 00 00 00
    const random = def.colors === 'gradR' && !!s.random;
    const stops: number[][] = random
      ? Array.from({ length: MAX_STOPS }, () => [0, 0, 0, 0])
      : (s.stops ?? []).slice(0, MAX_STOPS).map((st) => [Math.round(st.p), ...rgb(st.c)]);
    const all = Array.from({ length: MAX_STOPS }, (_, i) => stops[i] ?? [0xff, 0, 0, 0]);
    return [
      [...head(2), speed, s.bright, random ? 1 : 0, def.directions ? (s.dir ?? 0) : 0, s.width ?? 0, stops.length, ...all[0], ...all[1]],
      [...head(1), ...all[2], ...all[3], ...all[4], ...all[5]],
      [...head(0), ...all[6], 0, 0, 0],
    ];
  }

  if (def.colors === 'qs') {
    // 2 chunks: 6 colours + (unused) background
    const cols = s.random ? Array.from({ length: 6 }, () => [0, 0, 0]) : (s.six ?? [...QUICKSAND_DEFAULT]).map(rgb);
    return [
      [...head(1), speed, s.bright, s.random ? 1 : 0, s.dir ?? 6, 0, ...cols[0], ...cols[1], ...cols[2]],
      [...head(0), ...cols[3], ...cols[4], ...cols[5], 0, 0, 0],
    ];
  }

  let c1 = [0, 0, 0];
  let c2 = [0, 0, 0];
  let single = true;
  let random = false;
  if (def.colors === 'one') c1 = rgb(s.color ?? '#ff0000');
  if (def.colors === 'sdr') {
    random = s.colorMode === 'random';
    single = s.colorMode !== 'double';
    if (s.colorMode === 'double') {
      c1 = rgb(s.double?.[0] ?? '#ff0000');
      c2 = rgb(s.double?.[1] ?? '#ff00ff');
    } else {
      c1 = c2 = rgb(s.single ?? '#ff0000');
    }
  }
  const bg = def.background && s.bgOn ? rgb(s.bg ?? '#000000') : [0, 0, 0];
  const flags = ((single ? 0 : 1) << 4) | (random ? 1 : 0);
  return [[...head(0), speed, s.bright, flags, 0xff, 0xff, ...c1, ...c2, ...bg]];
}
