/** Asked before talking to a keyboard whose support hasn't been verified on real hardware (Azoth X). */
import { useState } from 'preact/hooks';
import { confirmExperimental, experimentalPrompt } from '../state/connection';
import { t } from '../i18n';
import { ISSUES_URL } from './links';

export function ExperimentalDialog() {
  const p = experimentalPrompt.value;
  const [remember, setRemember] = useState(true);
  if (!p) return null;
  return (
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="exp-title">
        <h3 id="exp-title">{t('exp.title', { name: p.productName })}</h3>
        <p>{t('exp.body1')}</p>
        <p>{t('exp.body2')}</p>
        <p>
          {t('exp.body3')}{' '}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
            {t('exp.report')}
          </a>
        </p>
        <label class="chk">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember((e.currentTarget as HTMLInputElement).checked)} />{' '}
          {t('exp.remember')}
        </label>
        <div class="modal-actions">
          <button onClick={() => confirmExperimental(false, false)}>{t('exp.cancel')}</button>
          <button class="primary" onClick={() => confirmExperimental(true, remember)}>
            {t('exp.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
