import { useEffect, useRef } from 'preact/hooks';
import { KEY, LAYOUT, TARGET_GROUPS } from '../../devices/azoth/keys';
import { current } from '../../state/profiles';
import { selectedKey } from '../../state/ui';
import { mapKey, restoreAllKeys } from '../../state/actions';
import { t, type MessageKey } from '../../i18n';
import { keyLabel } from '../../i18n/labels';
import { Card, ConfirmButton } from '../common/controls';

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
    </>
  );
}
