import { QUICKSAND_DEFAULT, QUICKSAND_OFFSETS, type ColorStop, type EffectDef, type EffectSettings } from '../../devices/azoth/lighting';

export const gradientCss = (stops: ColorStop[]): string =>
  stops.length === 1 ? stops[0].c : `linear-gradient(90deg,${stops.map((s) => `${s.c} ${s.p}%`).join(',')})`;

export const quicksandStops = (six: readonly string[] = QUICKSAND_DEFAULT): ColorStop[] =>
  six.map((c, i) => ({ c, p: QUICKSAND_OFFSETS[i] }));

const RAINBOW = 'linear-gradient(90deg,#f33,#fd0,#3f6,#0cf,#a3f)';
const RANDOM = 'linear-gradient(90deg,#f33,#3f6,#0cf)';

/** Colour strip shown under each effect button. */
export function effectSwatch(def: EffectDef, s: EffectSettings): string {
  switch (def.colors) {
    case 'none': return RAINBOW;
    case 'one': return s.color ?? '#ff0000';
    case 'grad': return gradientCss(s.stops ?? []);
    case 'gradR': return s.random ? RANDOM : gradientCss(s.stops ?? []);
    case 'qs': return s.random ? RANDOM : gradientCss(quicksandStops(s.six));
    case 'sdr':
      if (s.colorMode === 'single') return s.single ?? '#ff0000';
      if (s.colorMode === 'double') return `linear-gradient(90deg,${s.double?.[0]},${s.double?.[1]})`;
      return RANDOM;
  }
}
