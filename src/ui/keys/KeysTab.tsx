import { useEffect, useRef } from 'preact/hooks';
import { KEY, LAYOUT, TARGET_GROUPS } from '../../devices/azoth/keys';
import { LEVER, LEVER_CUSTOM, LEVER_DEFAULT, LEVER_MODES, LEVER_SOURCES } from '../../devices/azoth/lever';
import { device, online } from '../../state/connection';
import { forgetLeverRead, leverBusy, leverView, readLever, resetLever, rewriteLever, setLeverModeEnabled, setLeverTarget } from '../../state/lever';
import { current } from '../../state/profiles';
import { selectedKey } from '../../state/ui';
import { mapKey, restoreAllKeys } from '../../state/actions';
import { t, type MessageKey } from '../../i18n';
import { keyLabel } from '../../i18n/labels';
import { Card, ConfirmButton, Seg } from '../common/controls';

const KEY_UNIT = 46;
const GAP = 5;

function KeyboardMap() {
  const map = current.value.keyMap;
  const sel = selectedKey.value;
  return (
    <div class="kb">
      {LAYOUT.map((row, r) => (
        <div class="r" key={r}>
          {row.map(([name, w]) => {
            const code = KEY[name];
            const width = `${w * KEY_UNIT + (w - 1) * GAP}px`;
            if (code === undefined)
              return (
                <div key={name} class="k nokey" style={{ width }} title={t('keys.fnLocked')}>
                  {name}
                </div>
              );
            const target = map[code];
            return (
              <div
                key={name}
                class={`k ${target !== undefined ? 'mapped' : ''} ${sel === code ? 'sel' : ''}`}
                style={{ width }}
                onClick={() => (selectedKey.value = sel === code ? null : code)}
              >
                <span>{name}</span>
                {target !== undefined && <span class="to">→ {keyLabel(target)}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TargetPicker({ source }: { source: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [source]);
  const map = current.value.keyMap;
  const now = map[source] ?? source;
  return (
    <div ref={ref}>
      <Card
        title={t('keys.mapTo')}
        sub={t('keys.current', { key: keyLabel(source), target: keyLabel(now) })}
        actions={
          <>
            <button disabled={map[source] === undefined} onClick={() => void mapKey(source, source)}>
              {t('keys.restore')}
            </button>
            <button onClick={() => (selectedKey.value = null)}>{t('keys.done')}</button>
          </>
        }
      >
        {TARGET_GROUPS.map((g) => (
          <div key={g.id}>
            <div class="group-title">{t(`group.${g.id}` as MessageKey)}</div>
            <div class="targets">
              {g.codes.map((code) => (
                <button key={code} class={code === now ? 'sel' : ''} onClick={() => void mapKey(source, code)}>
                  {keyLabel(code)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function KeysTab() {
  return (
    <>
      <Card title={t('keys.keyboard')} sub={t('keys.clickHint')} actions={<ConfirmButton onConfirm={() => void restoreAllKeys()}>{t('keys.restoreAll')}</ConfirmButton>}>
        <KeyboardMap />
        <p class="hint">{t('keys.note')}</p>
      </Card>
      {selectedKey.value !== null && <TargetPicker source={selectedKey.value} />}
      <LeverCard />
    </>
  );
}

const LEVER_LABEL: Record<number, MessageKey> = { [LEVER.UP]: 'lever.up', [LEVER.PRESS]: 'lever.press', [LEVER.DOWN]: 'lever.down' };

/** On / off for one lever mode. */
function ModeSwitch({ mode }: { mode: number }) {
  return (
    <div class={leverBusy.value ? 'blocked' : ''}>
      <Seg
        options={[[true, t('common.on')], [false, t('common.off')]]}
        value={leverView.value.enabled[mode]}
        onChange={(on) => void setLeverModeEnabled(mode, on)}
      />
    </div>
  );
}

/**
 * Control lever: custom-mode mapping and which modes the side button cycles through.
 * The keyboard can't report these, so what's shown is what was set here (per profile).
 */
function LeverCard() {
  const az = device.value;
  useEffect(() => {
    forgetLeverRead();
    if (az && online.value) void readLever();
  }, [az, online.value]);
  const view = leverView.value;
  const busy = leverBusy.value;
  return (
    <Card
      title={t('lever.title')}
      sub={t('lever.sub')}
      actions={
        <>
          <button disabled={!az || busy} onClick={() => void readLever()}>
            {t('lever.read')}
          </button>
          <button disabled={!az || busy} onClick={() => void rewriteLever()} title={t('lever.rewriteHint')}>
            {t('lever.rewrite')}
          </button>
          <ConfirmButton disabled={!az || busy} onConfirm={() => void resetLever()}>
            {t('lever.reset')}
          </ConfirmButton>
        </>
      }
    >
      <div class="lever-rows">
        <div class="lever-mode">
          {t('lever.current')}
          <b>{view.mode != null ? t(`lever.mode.${view.mode}` as MessageKey) : '—'}</b>
        </div>
        <div class="group-title">{t('lever.customTitle')}</div>
        <div class="row">
          <label class={view.mode === LEVER_CUSTOM ? 'cur' : ''}>{t('lever.customSwitch')}</label>
          <ModeSwitch mode={LEVER_CUSTOM} />
        </div>
        {LEVER_SOURCES.map((src) => {
          const now = view.targets[src];
          const label = t(LEVER_LABEL[src]);
          return (
            <div class="row" key={src}>
              <label>{label}</label>
              <select
                disabled={!az || busy}
                value={now}
                onChange={(e) => void setLeverTarget(src, Number((e.currentTarget as HTMLSelectElement).value), label)}
              >
                <option value={LEVER_DEFAULT[src]}>{t('lever.default', { key: keyLabel(LEVER_DEFAULT[src]) })}</option>
                {TARGET_GROUPS.map((g) => (
                  <optgroup key={g.id} label={t(`group.${g.id}` as MessageKey)}>
                    {g.codes.map((code) => (
                      <option key={code} value={code}>
                        {keyLabel(code)}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {!TARGET_GROUPS.some((g) => g.codes.includes(now)) && now !== LEVER_DEFAULT[src] && <option value={now}>{keyLabel(now)}</option>}
              </select>
            </div>
          );
        })}
        <p class="hint">{t('lever.customHint', { mode: t(`lever.mode.${LEVER_CUSTOM}` as MessageKey) })}</p>
        <div class="group-title">{t('lever.modesTitle')}</div>
        {LEVER_MODES.filter((m) => m !== LEVER_CUSTOM).map((m) => (
          <div class="row" key={m}>
            <label class={view.mode === m ? 'cur' : ''}>{t(`lever.mode.${m}` as MessageKey)}</label>
            <ModeSwitch mode={m} />
          </div>
        ))}
        <p class="hint">{t('lever.modesHint')}</p>
      </div>
    </Card>
  );
}
