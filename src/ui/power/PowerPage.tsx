import { LOW_BATTERY_LEVELS, SAVING, SAVING_MODES, SLEEP_CODES } from '../../devices/azoth/power';
import { POLLING_CHOICES, POLLING_HZ } from '../../devices/azoth/performance';
import { booster, pollingRate, power } from '../../state/connection';
import { setLowBattery, setPollingRate, setPowerSaving, setSleep } from '../../state/actions';
import { t, type MessageKey } from '../../i18n';
import { sleepName } from '../../i18n/labels';
import { Card, Row, Seg } from '../common/controls';
import { load, save } from '../../util/storage';

/** remembers which saving mode to restore when the toggle is switched back on */
const lastSavingMode = (): number => load('savingMode', SAVING.LIGHTS_OFF);

export function PowerPage() {
  const p = power.value;
  const savingOn = !!p && p.saving !== SAVING.OFF;
  return (
    <div class="page">
      <h2>{t('power.title')}</h2>
      <p class="sub">{t('power.sub')}</p>
      <Card title={t('power.battery')}>
        <dl class="kv">
          <dt>{t('power.level')}</dt>
          <dd>{p ? `${p.battery}%` : '—'}</dd>
          <dt>{t('power.state')}</dt>
          <dd>{p ? t(p.charging ? 'header.bat.charging' : 'header.bat.onBattery') : '—'}</dd>
          <dt>{t('power.voltage')}</dt>
          <dd>{p?.millivolts ? t('power.voltageValue', { v: (p.millivolts / 1000).toFixed(2) }) : '—'}</dd>
        </dl>
      </Card>
      <Card title={t('power.section')}>
        <Row label={t('power.lowBattery')}>
          <Seg
            options={LOW_BATTERY_LEVELS.map((v) => [v, v === 0 ? t('common.never') : `${v}%`] as const)}
            value={p?.lowBattery}
            onChange={(v) => void setLowBattery(v)}
          />
        </Row>
        <p class="hint">{t('power.lowHint')}</p>
        <Row label={t('power.saving')}>
          <Seg
            options={[[true, t('common.on')], [false, t('common.off')]]}
            value={p ? savingOn : undefined}
            onChange={(on) => void setPowerSaving(on ? lastSavingMode() : SAVING.OFF)}
          />
        </Row>
        <div class={savingOn ? '' : 'blocked'}>
          <Row label="">
            <Seg
              options={SAVING_MODES.map((m) => [m, t(`saving.${m}` as MessageKey)] as const)}
              value={savingOn ? p!.saving : lastSavingMode()}
              onChange={(v) => {
                save('savingMode', v);
                void setPowerSaving(v);
              }}
            />
          </Row>
        </div>
        <p class="hint">{t('power.savingHint')}</p>
      </Card>
      <Card title={t('power.sleepSection')}>
        <Row label={t('power.idle')}>
          <Seg options={SLEEP_CODES.map((c) => [c, sleepName(c)] as const)} value={p?.idle} onChange={(v) => void setSleep(v)} />
        </Row>
        <p class="hint">{t('power.sleepHint')}</p>
      </Card>
      <PollingRateCard />
    </div>
  );
}

/** Azoth X only (experimental): shown only while the keyboard reports a ROG Polling Rate Booster, as on the vendor page. */
function PollingRateCard() {
  const b = booster.value;
  if (!b?.connected) return null;
  const hex4 = (n: number) => n.toString(16).padStart(4, '0');
  return (
    <Card title={t('power.pollingSection')}>
      <Row label={t('power.pollingRate')}>
        <Seg
          options={POLLING_CHOICES.map((c) => [c, `${POLLING_HZ[c]} Hz`] as const)}
          value={pollingRate.value ?? undefined}
          onChange={(v) => void setPollingRate(v)}
        />
      </Row>
      <p class="hint">
        {t('power.pollingHint')}
        {b.info && ` ${t('power.boosterInfo', { fw: b.info.firmware || '—', id: `${hex4(b.info.vid)}:${hex4(b.info.pid)}` })}`}
      </p>
    </Card>
  );
}
