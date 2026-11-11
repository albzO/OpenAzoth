import { useState } from 'preact/hooks';
import { current, updateCurrent, type OledMode } from '../../state/profiles';
import { online } from '../../state/connection';
import { setOledBrightness, setOledPower, showClock, showPreset } from '../../state/actions';
import { t, type MessageKey } from '../../i18n';
import { Card, Row, Seg } from '../common/controls';
import { OledPreview, type Scene } from './OledPreview';
import {
  BannerPanel, ClockPanel, ImagePanel, PresetPanel, bannerScene, clockScene, imageInteraction, imageScene, useImageState, usePresetScene,
} from './panels';

const MODES: OledMode[] = ['preset', 'image', 'banner', 'clock'];

export function OledTab() {
  const oled = current.value.oled;
  const image = useImageState(); // kept here so the decoded image survives switching modes
  const presetScene = usePresetScene(oled.preset);
  const [brightness, setBrightness] = useState<number | null>(null);

  let scene: Scene;
  let hint: string;
  switch (oled.mode) {
    case 'image':
      scene = imageScene(image);
      hint = t('oled.hint.image');
      break;
    case 'banner':
      scene = bannerScene();
      hint = t('oled.hint.banner');
      break;
    case 'clock':
      scene = clockScene(oled.clock24h);
      hint = t('oled.hint.clock');
      break;
    default:
      scene = presetScene;
      hint = t('oled.hint.preset', { n: oled.preset + 1 });
  }

  // picking a screen that needs no upload switches the OLED right away
  const pickMode = (m: OledMode) => {
    updateCurrent((p) => (p.oled.mode = m));
    if (!online.value) return;
    if (m === 'clock') void showClock();
    if (m === 'preset') void showPreset(oled.preset);
  };

  return (
    <>
      <Card title={t('oled.screen')}>
        <Row label={t('oled.display')}>
          <Seg options={[[true, t('common.on')], [false, t('common.off')]]} value={oled.on} onChange={(on) => void setOledPower(on)} />
          <span class="spacer" />
          <span class="muted">{t('oled.brightness')}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={25}
            style="max-width:220px"
            value={brightness ?? oled.brightness}
            onInput={(e) => setBrightness(+(e.currentTarget as HTMLInputElement).value)}
            onChange={(e) => {
              setBrightness(null);
              void setOledBrightness(+(e.currentTarget as HTMLInputElement).value);
            }}
          />
          <span class="val">{brightness ?? oled.brightness}%</span>
        </Row>
        <div class="oled-wrap">
          <OledPreview scene={scene} interact={oled.mode === 'image' ? imageInteraction(image) : undefined} />
        </div>
        <p class="hint">{hint}</p>
      </Card>

      <div class="oled-modes">
        {MODES.map((m) => (
          <button key={m} class={`oled-mode ${oled.mode === m ? 'sel' : ''}`} onClick={() => pickMode(m)}>
            <b>{t(`oled.mode.${m}` as MessageKey)}</b>
            <span>{t(`oled.mode.${m}Sub` as MessageKey)}</span>
          </button>
        ))}
      </div>

      {oled.mode === 'preset' && <PresetPanel />}
      {oled.mode === 'image' && <ImagePanel st={image} />}
      {oled.mode === 'banner' && <BannerPanel />}
      {oled.mode === 'clock' && <ClockPanel />}
      <p class="hint">{t('oled.unsupported')}</p>
    </>
  );
}
