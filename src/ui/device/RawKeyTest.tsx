/**
 * Debug: map one test key to any raw firmware key code, to find out whether the keyboard has
 * codes beyond the official table (e.g. F13–F24). Not recorded in the profile; "Restore" puts
 * the key back to what this page has recorded for it (or itself).
 */
import { useEffect, useState } from 'preact/hooks';
import { KEY } from '../../devices/azoth/keys';
import { device, online } from '../../state/connection';
import { log, toast } from '../../state/feedback';
import { current } from '../../state/profiles';
import { t, type MessageKey } from '../../i18n';
import { keyLabel } from '../../i18n/labels';
import { Card } from '../common/controls';

const SOURCES = ['R Ctrl', 'Ins', 'Menu', 'PgUp', 'PgDn', 'Del', 'R Alt'].filter((n) => KEY[n] !== undefined);

const parseCode = (s: string): number | null => {
  const v = s.trim().toLowerCase();
  const n = v.startsWith('0x') ? parseInt(v.slice(2), 16) : /^\d+$/.test(v) ? parseInt(v, 10) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 0xffff ? n : null;
};

export function RawKeyTest() {
  const [source, setSource] = useState(KEY['R Ctrl']);
  const [text, setText] = useState('127');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [seen, setSeen] = useState('');

  // show what the computer receives, so no other page is needed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      setSeen(`key "${e.key}" · code "${e.code}" · keyCode ${e.keyCode}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const code = parseCode(text);
  const az = device.value;
  const can = !!az && online.value && !busy;

  const send = async (target: number, restoring: boolean) => {
    if (!az) return;
    setBusy(true);
    try {
      const r = await az.bindKeyRaw(source, target);
      if (r === 'ok') await az.save();
      const hex = `0x${target.toString(16).padStart(2, '0')}`;
      const msg = restoring && r === 'ok'
        ? t('rawkey.restored', { key: keyLabel(source) })
        : t(`rawkey.result.${r}` as MessageKey, { key: keyLabel(source), code: `${target} (${hex})` });
      setResult(msg);
      log('sy', msg);
      if (r !== 'ok') toast(msg, true);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('rawkey.title')} sub={t('rawkey.sub')}>
      <div class="row">
        <span class="label">{t('rawkey.source')}</span>
        <select value={source} onChange={(e) => setSource(Number((e.currentTarget as HTMLSelectElement).value))}>
          {SOURCES.map((n) => (
            <option key={n} value={KEY[n]}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div class="row">
        <span class="label">{t('rawkey.code')}</span>
        <input type="text" value={text} size={8} onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)} />
        <button disabled={!can || code === null} class="primary" onClick={() => code !== null && void send(code, false)}>
          {t('rawkey.map')}
        </button>
        <button disabled={code === null} onClick={() => code !== null && setText(String(code + 1))}>
          {t('rawkey.next')}
        </button>
        <button disabled={!can} onClick={() => void send(current.value.keyMap[source] ?? source, true)}>
          {t('rawkey.restore')}
        </button>
      </div>
      {result && <p class="hint">{result}</p>}
      <p class="hint">{t('rawkey.seen', { what: seen || '—' })}</p>
      <p class="hint">{t('rawkey.howto')}</p>
    </Card>
  );
}
