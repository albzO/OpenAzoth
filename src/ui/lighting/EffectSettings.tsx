/** Settings panel for the selected effect — the controls the vendor page offers, per effect. */
import { DIRECTION_ARROW, effectById, settingsOf, type ColorMode } from '../../devices/azoth/lighting';
import { current } from '../../state/profiles';
import { changeEffect } from '../../state/actions';
import { t, type MessageKey } from '../../i18n';
import { effectName } from '../../i18n/labels';
import { Card, ColorInput, Row, Seg, Slider } from '../common/controls';
import { GradientEditor } from './GradientEditor';
import { gradientCss, quicksandStops } from './swatch';

const level = (prefix: 'speed' | 'width', v: number) => t(`${prefix}.${v}` as MessageKey);

export function EffectSettings() {
  const lighting = current.value.lighting;
  const def = effectById(lighting.effect);
  const s = settingsOf(lighting);
  const set = changeEffect;
  const colorModes: [ColorMode, string][] = [['single', t('light.single')], ['double', t('light.double')], ['random', t('light.random')]];

  return (
    <Card title={effectName(def.id)}>
      {def.background && (
        <Row label={t('light.background')}>
          <Seg options={[[true, t('light.single')], [false, t('light.off')]]} value={!!s.bgOn} onChange={(bgOn) => set({ bgOn })} />
          {s.bgOn && <ColorInput value={s.bg ?? '#000000'} onInput={(bg) => set({ bg })} />}
        </Row>
      )}

      {def.colors === 'one' && (
        <Row label={t('light.color')}>
          <ColorInput value={s.color ?? '#ff0000'} onInput={(color) => set({ color })} />
        </Row>
      )}

      {def.colors === 'sdr' && (
        <Row label={t('light.color')}>
          <Seg options={colorModes} value={s.colorMode} onChange={(colorMode) => set({ colorMode })} />
          {s.colorMode === 'single' && <ColorInput value={s.single ?? '#ff0000'} onInput={(single) => set({ single })} />}
          {s.colorMode === 'double' && (
            <>
              <ColorInput value={s.double?.[0] ?? '#ff0000'} onInput={(c) => set({ double: [c, s.double?.[1] ?? '#ff00ff'] })} />
              <ColorInput value={s.double?.[1] ?? '#ff00ff'} onInput={(c) => set({ double: [s.double?.[0] ?? '#ff0000', c] })} />
            </>
          )}
        </Row>
      )}

      {(def.colors === 'grad' || def.colors === 'gradR' || def.colors === 'qs') && (
        <Row label={t('light.color')}>
          {def.colors === 'grad' ? (
            <span class="muted">{t('light.pattern')}</span>
          ) : (
            <Seg options={[[false, t('light.pattern')], [true, t('light.random')]]} value={!!s.random} onChange={(random) => set({ random })} />
          )}
        </Row>
      )}

      {(def.colors === 'grad' || (def.colors === 'gradR' && !s.random)) && (
        <GradientEditor stops={s.stops ?? []} onChange={(stops) => set({ stops })} />
      )}

      {def.colors === 'qs' && !s.random && (
        <>
          <Row label="">
            <div class="gradbar" style={{ background: gradientCss(quicksandStops(s.six)) }} />
          </Row>
          <Row label={t('light.stops')}>
            {(s.six ?? []).map((c, i) => (
              <ColorInput key={i} value={c} onInput={(v) => set({ six: (s.six ?? []).map((x, k) => (k === i ? v : x)) })} />
            ))}
          </Row>
        </>
      )}

      <div class="group-title">{t('light.adjust')}</div>
      <Slider label={t('light.brightness')} min={0} max={100} step={5} value={s.bright} format={(v) => `${v}%`} onInput={(bright) => set({ bright })} />
      {def.speeds && <Slider label={t('light.speed')} min={0} max={2} step={1} value={s.speed} format={(v) => level('speed', v)} onInput={(speed) => set({ speed })} />}
      {def.width && <Slider label={t('light.width')} min={0} max={2} step={1} value={s.width ?? 0} format={(v) => level('width', v)} onInput={(width) => set({ width })} />}
      {def.directions && (
        <Row label={t('light.direction')}>
          <Seg
            class="dirs"
            options={def.directions.map((d) => [d, DIRECTION_ARROW[d]] as const)}
            titles={Object.fromEntries(def.directions.map((d) => [String(d), t(`dir.${d}` as MessageKey)]))}
            value={s.dir}
            onChange={(dir) => set({ dir })}
          />
        </Row>
      )}
    </Card>
  );
}
