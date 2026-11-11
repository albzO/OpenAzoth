import { selectedProfile } from '../state/profiles';
import { profileTab, type ProfileTab } from '../state/ui';
import { t, type MessageKey } from '../i18n';
import { LightingTab } from './lighting/LightingTab';
import { OledTab } from './oled/OledTab';
import { KeysTab } from './keys/KeysTab';

const TABS: [ProfileTab, string, MessageKey][] = [
  ['lighting', '✦', 'tab.lighting'],
  ['oled', '▭', 'tab.oled'],
  ['keys', '⌨', 'tab.keys'],
];

export function ProfilePage() {
  return (
    <div class="page">
      <h2>{t('profile.title', { n: selectedProfile.value + 1 })}</h2>
      <p class="sub">{t('profile.sub')}</p>
      <div class="tabs">
        {TABS.map(([id, icon, label]) => (
          <button key={id} class={profileTab.value === id ? 'sel' : ''} onClick={() => (profileTab.value = id)}>
            <span class="ti">{icon}</span>
            {t(label)}
          </button>
        ))}
      </div>
      {profileTab.value === 'lighting' && <LightingTab />}
      {profileTab.value === 'oled' && <OledTab />}
      {profileTab.value === 'keys' && <KeysTab />}
    </div>
  );
}
