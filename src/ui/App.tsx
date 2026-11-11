import { device, online } from '../state/connection';
import { toastMessage } from '../state/feedback';
import { page } from '../state/ui';
import { hidAvailable } from '../hid/discovery';
import { t } from '../i18n';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ProfilePage } from './ProfilePage';
import { PowerPage } from './power/PowerPage';
import { DevicePage } from './device/DevicePage';
import { SyncPage } from './sync/SyncPage';

function Placeholder() {
  if (!hidAvailable())
    return (
      <div class="empty">
        <h2>{t('app.noHid.title')}</h2>
        <p>{t('app.noHid.body')}</p>
      </div>
    );
  return (
    <div class="empty">
      <h2>{t('app.connect.title')}</h2>
      <p>
        {t('app.connect.body1')}
        <br />
        {t('app.connect.body2')}
      </p>
    </div>
  );
}

export function App() {
  const connected = !!device.value;
  const blocked = connected && !online.value ? 'blocked' : '';
  let body;
  if (page.value === 'device') body = <DevicePage />;
  else if (!connected) body = <Placeholder />;
  else if (page.value === 'sync') body = <SyncPage />;
  else if (page.value === 'power') body = <div class={blocked}><PowerPage /></div>;
  else body = <div class={blocked}><ProfilePage /></div>;

  const toast = toastMessage.value;
  return (
    <div class="shell">
      <Header />
      <Sidebar />
      <main class="content">{body}</main>
      {toast && <div class={`toast ${toast.error ? 'err' : ''}`}>{toast.text}</div>}
    </div>
  );
}
