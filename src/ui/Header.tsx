/** Top bar: live keyboard / battery / receiver / profile status, language switch and connect button. */
import {
  connectByPicker, connectionKind, currentEffect, device, disconnect, info, keyboardState, model, oledContent, power, receiver, statusMessage,
} from '../state/connection';
import { saveState } from '../state/actions';
import { hidAvailable } from '../hid/discovery';
import { t, toggleLang, type MessageKey } from '../i18n';
import { connectionName, effectName, oledContentName, sleepName } from '../i18n/labels';

const SAVE_TEXT: Record<string, MessageKey | null> = { idle: null, pending: 'header.save.pending', saved: 'header.save.saved', error: 'header.save.error' };

function KeyboardStatus() {
  const s = keyboardState.value;
  const cls = s === 'online' ? 'on' : s === 'none' ? 'off' : 'warn';
  const kind = connectionKind.value;
  const title =
    s === 'online' ? t('header.kb.online', { via: kind ? connectionName(kind) : '' }) : t(s === 'none' ? 'header.kb.none' : s === 'reading' ? 'header.kb.reading' : 'header.kb.offline');
  const detail =
    s === 'online'
      ? t('header.kb.fw', { fw: info.value?.keyboardFw || '—' }) + (power.value ? t('header.kb.sleep', { sleep: sleepName(power.value.idle) }) : '')
      : s === 'offline'
        ? t('header.kb.offlineDetail')
        : statusMessage.value
          ? t(statusMessage.value)
          : t('header.kb.hint');
  return (
    <div class={`st ${cls}`}>
      <span class="dot" />
      <div>
        <b>
          {title}
          {model.value === 'azothX' && <span class="tag-exp">{t('exp.tag')}</span>}
        </b>
        <span class="t">{detail}</span>
      </div>
    </div>
  );
}

function BatteryStatus() {
  const p = power.value;
  if (keyboardState.value !== 'online' || !p) return null;
  return (
    <div class="st">
      <span class={`batt ${p.charging ? 'chg' : p.battery <= 20 ? 'low' : ''}`}>
        <i style={{ width: `calc(${p.battery}% - 2px)` }} />
      </span>
      <div>
        <b>
          {p.battery}%{p.charging ? ' ⚡' : ''}
        </b>
        <span class="t">
          {t(p.charging ? 'header.bat.charging' : 'header.bat.onBattery')}
          {p.millivolts ? ` · ${(p.millivolts / 1000).toFixed(2)} V` : ''}
        </span>
      </div>
    </div>
  );
}

function ReceiverStatus() {
  const r = receiver.value;
  const cls = !r.present ? 'off' : r.linked === false ? 'warn' : 'on';
  const link = r.linked === true ? t('header.rx.linked') : r.linked === false ? t('header.rx.unlinked') : '';
  return (
    <div class={`st ${cls}`}>
      <span class="dot" />
      <div>
        <b>{t(r.present ? 'header.rx.present' : 'header.rx.absent')}</b>
        <span class="t">{r.present ? t('header.rx.fw', { fw: r.firmware || '—' }) + link : t('header.rx.absentDetail')}</span>
      </div>
    </div>
  );
}

function ProfileStatus() {
  if (keyboardState.value !== 'online' || !info.value) return null;
  const effect = currentEffect.value;
  const oled = oledContent.value;
  const detail = [
    effect !== null && t('header.pf.effect', { name: effectName(effect) }),
    oled && t('header.pf.oled', { name: oledContentName(oled) }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div class="st">
      <div>
        <b>{t('nav.profileN', { n: info.value.profile + 1 })}</b>
        <span class="t">{detail}</span>
      </div>
    </div>
  );
}

export function Header() {
  const saveKey = SAVE_TEXT[saveState.value];
  return (
    <header class="topbar">
      <h1>
        {t('app.name')}
        <small>{t('app.tagline')}</small>
      </h1>
      <div class="status">
        <KeyboardStatus />
        <BatteryStatus />
        <ReceiverStatus />
        <ProfileStatus />
      </div>
      <div class="right">
        <span class={`saving ${saveState.value}`}>{saveKey ? t(saveKey) : ''}</span>
        <button class="ghost" onClick={toggleLang} title="中文 / English">
          {t('header.switchLang')}
        </button>
        {device.value ? (
          <button class="ghost" onClick={() => void disconnect('status.disconnected')}>
            {t('header.disconnect')}
          </button>
        ) : (
          <button class="primary" disabled={!hidAvailable()} onClick={() => void connectByPicker()}>
            {t('header.connect')}
          </button>
        )}
      </div>
    </header>
  );
}
