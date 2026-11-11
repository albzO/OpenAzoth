import { useEffect, useRef } from 'preact/hooks';
import { connectionKind, currentEffect, device, info, layoutCode, oledContent, refresh, serialNumber } from '../../state/connection';
import { clearLog, logEnabled, logEntries, toast } from '../../state/feedback';
import { t } from '../../i18n';
import { connectionName, effectName, oledContentName } from '../../i18n/labels';
import { Card } from '../common/controls';

const ARROW = { tx: '→', rx: '←', er: '!', sy: '·' } as const;

function Log() {
  const ref = useRef<HTMLPreElement>(null);
  const entries = logEntries.value;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);
  return (
    <pre class="log" ref={ref}>
      {entries.map((e) => (
        <div key={e.id} class={e.kind}>
          {e.time} {ARROW[e.kind]} {e.text}
        </div>
      ))}
    </pre>
  );
}

export function DevicePage() {
  const az = device.value;
  const i = info.value;
  const kind = connectionKind.value;
  const effect = currentEffect.value;
  const oled = oledContent.value;
  return (
    <div class="page">
      <h2>{t('device.title')}</h2>
      <p class="sub">
        {az
          ? t('device.via', { name: az.link.device.productName, conn: kind ? connectionName(kind) : '', id: az.link.reportId, len: az.link.reportLength })
          : t('device.notConnected')}
      </p>
      <div class="two-col">
        <Card
          title={t('device.info')}
          actions={
            <button disabled={!az} onClick={() => void refresh().then((ok) => toast(t(ok ? 'device.refreshed' : 'device.noResponse'), !ok))}>
              {t('device.refresh')}
            </button>
          }
        >
          <dl class="kv">
            <dt>{t('device.serial')}</dt>
            <dd>{serialNumber.value ?? '—'}</dd>
            <dt>{t('device.kbFw')}</dt>
            <dd>{i?.keyboardFw || '—'}</dd>
            <dt>{t('device.rxFw')}</dt>
            <dd>{i ? (i.receiverFw ?? t('device.wired')) : '—'}</dd>
            <dt>{t('device.profile')}</dt>
            <dd>{i ? i.profile + 1 : '—'}</dd>
            <dt>{t('device.effect')}</dt>
            <dd>{effect !== null ? effectName(effect) : '—'}</dd>
            <dt>{t('device.oled')}</dt>
            <dd>{oled ? oledContentName(oled) : '—'}</dd>
            <dt>{t('device.layout')}</dt>
            <dd>{layoutCode.value ?? '—'}</dd>
          </dl>
        </Card>
        <Card title={t('device.about')}>
          <p class="muted" style="margin:0">
            {t('device.aboutText')}
          </p>
        </Card>
      </div>
      <Card
        title={t('device.log')}
        actions={
          <>
            <label class="muted">
              <input type="checkbox" checked={logEnabled.value} onChange={(e) => (logEnabled.value = (e.currentTarget as HTMLInputElement).checked)} /> {t('device.logOn')}
            </label>
            <button onClick={clearLog}>{t('device.clear')}</button>
          </>
        }
      >
        <Log />
      </Card>
    </div>
  );
}
