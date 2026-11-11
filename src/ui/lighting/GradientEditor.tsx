/** 样式 editor for 彩虹 / 涟漪: preset styles + up to 7 editable colour stops. */
import { MAX_STOPS, PALETTES, type ColorStop } from '../../devices/azoth/lighting';
import { ColorInput, Row } from '../common/controls';
import { t } from '../../i18n';
import { gradientCss } from './swatch';

export function GradientEditor(props: { stops: ColorStop[]; onChange: (stops: ColorStop[]) => void }) {
  const { stops, onChange } = props;
  const set = (i: number, patch: Partial<ColorStop>, resort = false) => {
    const next = stops.map((s, k) => (k === i ? { ...s, ...patch } : s));
    onChange(resort ? next.sort((a, b) => a.p - b.p) : next);
  };
  return (
    <>
      <Row label="">
        <div class="palettes">
          {PALETTES.map((p, i) => (
            <button key={i} title={t('light.paletteN', { n: i + 1 })} style={{ background: gradientCss(p) }} onClick={() => onChange(p.map((s) => ({ ...s })))} />
          ))}
        </div>
      </Row>
      <Row label="">
        <div class="gradbar" style={{ background: gradientCss(stops) }} />
      </Row>
      <Row label={t('light.stops')}>
        <div class="stops">
          {stops.map((s, i) => (
            <div class="stop" key={i}>
              <ColorInput value={s.c} onInput={(c) => set(i, { c })} />
              <input
                type="number"
                min={0}
                max={100}
                value={s.p}
                onChange={(e) => set(i, { p: Math.max(0, Math.min(100, +(e.currentTarget as HTMLInputElement).value)) }, true)}
              />
              <button disabled={stops.length <= 1} onClick={() => onChange(stops.filter((_, k) => k !== i))}>
                ×
              </button>
            </div>
          ))}
          {stops.length < MAX_STOPS && (
            <button title={t('light.addStop', { n: MAX_STOPS })} onClick={() => onChange([...stops, { c: '#ffffff', p: 100 }])}>
              ＋
            </button>
          )}
        </div>
      </Row>
    </>
  );
}
