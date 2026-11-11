import { online } from '../../state/connection';
import { selectedProfile } from '../../state/profiles';
import { resetProfiles, syncAllProfiles, syncCurrentProfile, syncProgress } from '../../state/sync';
import { t, type MessageKey } from '../../i18n';
import { Card, ConfirmButton, Row } from '../common/controls';

const WHAT: MessageKey[] = ['sync.what.lighting', 'sync.what.keys', 'sync.what.oled', 'sync.what.power'];

export function SyncPage() {
  const prog = syncProgress.value;
  const busy = prog !== null;
  return (
    <div class="page">
      <h2>{t('sync.title')}</h2>
      <p class="sub">{t('sync.sub')}</p>
      <Card title={t('sync.what')}>
        <ul class="muted" style="margin:0;padding-left:18px;line-height:1.8">
          {WHAT.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </Card>
      <Card title={t('sync.start')}>
        <Row>
          <button class="primary" disabled={busy || !online.value} onClick={() => void syncCurrentProfile()}>
            {t('sync.current', { n: selectedProfile.value + 1 })}
          </button>
          <button disabled={busy || !online.value} onClick={() => void syncAllProfiles()}>
            {t('sync.all')}
          </button>
        </Row>
        {prog && (
          <>
            <progress value={prog.done} max={prog.total} />
            <p class="hint">{prog.label}</p>
          </>
        )}
        <p class="hint">{t('sync.hint')}</p>
      </Card>
      <Card title={t('reset.title')}>
        <p class="muted" style="margin:0 0 10px">{t('reset.sub')}</p>
        <Row>
          <ConfirmButton disabled={busy || !online.value} onConfirm={() => void resetProfiles(false)}>
            {t('reset.current', { n: selectedProfile.value + 1 })}
          </ConfirmButton>
          <ConfirmButton disabled={busy || !online.value} onConfirm={() => void resetProfiles(true)}>
            {t('reset.all')}
          </ConfirmButton>
        </Row>
        <p class="hint">{t('reset.hint')}</p>
      </Card>
    </div>
  );
}
