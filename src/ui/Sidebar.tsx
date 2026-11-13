import { info, online } from '../state/connection';
import { PROFILE_COUNT, selectedProfile } from '../state/profiles';
import { page, selectedKey, type Page } from '../state/ui';
import { selectProfile } from '../state/actions';
import { t, type MessageKey } from '../i18n';
import { ISSUES_URL } from './links';

const GLOBAL_PAGES: [Page, string, MessageKey][] = [
  ['sync', '⟳', 'nav.sync'],
  ['power', '⚡', 'nav.power'],
  ['editor', '✎', 'nav.editor'],
  ['device', 'ⓘ', 'nav.device'],
];

export function Sidebar() {
  const kbProfile = online.value ? info.value?.profile : undefined;
  return (
    <aside class="sidebar">
      <div class="cap">{t('nav.profiles')}</div>
      {Array.from({ length: PROFILE_COUNT }, (_, i) => (
        <button
          key={i}
          class={`navbtn ${page.value === 'profile' && selectedProfile.value === i ? 'sel' : ''}`}
          onClick={() => {
            page.value = 'profile';
            selectedKey.value = null;
            void selectProfile(i);
          }}
        >
          <span class="num">{i + 1}</span>
          <span class="label">{t('nav.profileN', { n: i + 1 })}</span>
          {kbProfile === i && <span class="live">{t('nav.active')}</span>}
        </button>
      ))}
      <div class="cap">{t('nav.global')}</div>
      {GLOBAL_PAGES.map(([id, icon, label]) => (
        <button key={id} class={`navbtn ${page.value === id ? 'sel' : ''}`} onClick={() => (page.value = id)}>
          <span class="ico">{icon}</span>
          <span class="label">{t(label)}</span>
        </button>
      ))}
      <a class="navbtn bug" href={ISSUES_URL} target="_blank" rel="noopener noreferrer" title={t('nav.bugHint')}>
        <span class="ico">🐞</span>
        <span class="label">{t('nav.bug')}</span>
      </a>
    </aside>
  );
}
