import { EFFECTS, settingsOf } from '../../devices/azoth/lighting';
import { current } from '../../state/profiles';
import { resetLighting, selectEffect } from '../../state/actions';
import { online } from '../../state/connection';
import { t } from '../../i18n';
import { effectName } from '../../i18n/labels';
import { Card, ConfirmButton } from '../common/controls';
import { EffectSettings } from './EffectSettings';
import { KeyboardPreview } from './KeyboardPreview';
import { effectSwatch } from './swatch';

function EffectPicker() {
  const lighting = current.value.lighting;
  return (
    <Card
      title={t('light.effects')}
      actions={
        <ConfirmButton disabled={!online.value} title={t('light.resetHint')} onConfirm={() => void resetLighting()}>
          {t('light.reset')}
        </ConfirmButton>
      }
    >
      <div class="effects">
        {EFFECTS.map((def) => (
          <button key={def.id} class={`effect ${lighting.effect === def.id ? 'sel' : ''}`} onClick={() => selectEffect(def.id)}>
            <span>{effectName(def.id)}</span>
            <span class="sw" style={{ background: effectSwatch(def, settingsOf(lighting, def.id)) }} />
          </button>
        ))}
      </div>
    </Card>
  );
}

export function LightingTab() {
  return (
    <>
      <Card title={t('light.preview')} sub={t('light.previewSub')}>
        <KeyboardPreview />
      </Card>
      <div class="two-col">
        <EffectPicker />
        <EffectSettings />
      </div>
    </>
  );
}
