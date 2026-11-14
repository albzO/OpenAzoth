/**
 * 同步设置: write the settings this app has recorded back to the keyboard, like the vendor
 * page's sync. Useful after another tool changed things, or on a freshly reset keyboard.
 *
 * Per profile:
 *   1. lighting  every effect's settings, the selected effect last (so it ends up active)
 *   2. keys      every key on the layout: its recorded target, or itself (= default)
 *   3. lever     which modes are on, and the custom-mode mapping (recorded or default)
 *   4. OLED      power, brightness, then the content: preset / clock / banner / last uploaded image
 *   5. save to flash
 * Power settings are global and read back from the keyboard, so they are never out of sync.
 */
import { signal } from '@preact/signals';
import { EFFECTS, KEY, LAYOUT, LEVER_DEFAULT, LEVER_MODES, LEVER_SOURCES, type Azoth } from '../devices/azoth';
import { renderBanner } from '../media/banner';
import { pack4 } from '../media/gray4';
import { getBlob } from '../util/blobStore';
import { device, info, online, refresh } from './connection';
import { log, toast } from './feedback';
import { PROFILE_COUNT, profiles, resetProfileSettings, selectedProfile, type ProfileSettings } from './profiles';
import { activateSelected, imageKey, legacyImageKey } from './actions';
import { t } from '../i18n';
import { effectName } from '../i18n/labels';

export interface SyncProgress {
  label: string;
  done: number;
  total: number;
}
export const syncProgress = signal<SyncProgress | null>(null);
export const syncing = (): boolean => syncProgress.value !== null;

const LAYOUT_CODES = LAYOUT.flat()
  .map(([name]) => KEY[name])
  .filter((c): c is number => c !== undefined);

/** number of progress steps per profile: effects + keys + lever + OLED + save */
const STEPS_PER_PROFILE = EFFECTS.length + LAYOUT_CODES.length + 3;

async function syncOne(az: Azoth, index: number, p: ProfileSettings, step: (label: string) => void): Promise<string[]> {
  const notes: string[] = [];
  const tag = t('nav.profileN', { n: index + 1 });
  await az.setProfile(index);

  // 1. lighting — current effect last
  const order = [...EFFECTS.filter((e) => e.id !== p.lighting.effect), EFFECTS.find((e) => e.id === p.lighting.effect)!];
  for (const e of order) {
    await az.applyLighting({ ...p.lighting, effect: e.id });
    step(t('sync.step.lighting', { p: tag, name: effectName(e.id) }));
  }

  // 2. keys — the whole layout
  for (const code of LAYOUT_CODES) {
    await az.bindKey(code, p.keyMap[code] ?? code);
    step(t('sync.step.keys', { p: tag }));
  }

  // 3. lever — a firmware that refuses it shouldn't stop the rest of the sync
  try {
    for (const m of LEVER_MODES) await az.enableLeverMode(m, p.lever.enabled[m] ?? true);
    for (const src of LEVER_SOURCES) await az.bindLever(src, p.lever.map[src] ?? LEVER_DEFAULT[src]);
  } catch (e) {
    notes.push(t('sync.leverFailed', { p: tag, msg: e instanceof Error ? e.message : String(e) }));
  }
  step(t('sync.step.lever', { p: tag }));

  // 4. OLED
  const o = p.oled;
  await az.oledPower(o.on);
  if (o.on) {
    await az.oledBrightness(o.brightness);
    if (o.mode === 'preset') await az.oledPreset(o.preset);
    else if (o.mode === 'clock') await az.oledClock(o.clock24h);
    else if (o.mode === 'banner') {
      const r = renderBanner(o.banner);
      const data = new Uint8Array((r.w * r.h) / 2);
      pack4(r.levels, data);
      await az.uploadBanner(o.banner.pattern, o.banner.layout, r.w, r.h, data);
    } else {
      const img = (await getBlob(imageKey(index))) ?? (await getBlob(legacyImageKey(index)));
      if (img) await az.uploadImage(img);
      else notes.push(t('sync.imageMissing', { p: tag }));
    }
  }
  step(t('sync.step.oled', { p: tag }));

  // 5. persist
  await az.save();
  step(t('sync.step.save', { p: tag }));
  return notes;
}

async function run(indices: number[], doneText = t('sync.done')): Promise<void> {
  const az = device.value;
  if (!az || !online.value || syncing()) return;
  const returnTo = info.value?.profile ?? selectedProfile.value;
  const total = indices.length * STEPS_PER_PROFILE;
  let done = 0;
  const step = (label: string) => (syncProgress.value = { label, done: ++done, total });
  syncProgress.value = { label: t('sync.begin'), done: 0, total };
  log('sy', t('sync.log', { list: indices.map((i) => t('nav.profileN', { n: i + 1 })).join(', ') }));
  try {
    const notes: string[] = [];
    for (const i of indices) notes.push(...(await syncOne(az, i, profiles.value[i], step)));
    if (indices.length > 1 || indices[0] !== returnTo) await az.setProfile(returnTo);
    toast(notes.length ? t('sync.withNotes', { done: doneText, notes: notes.join('; ') }) : doneText);
  } catch (e) {
    toast(t('sync.failed', { msg: e instanceof Error ? e.message : String(e) }), true);
  } finally {
    syncProgress.value = null;
    await refresh();
  }
}

/**
 * Factory-reset the selected profile (or all six) on the keyboard, put the app's record back
 * to defaults and write those defaults, so keyboard and page agree afterwards.
 */
export async function resetProfiles(all: boolean): Promise<void> {
  const az = device.value;
  if (!az || !online.value || syncing()) return;
  const indices = all ? Array.from({ length: PROFILE_COUNT }, (_, i) => i) : [selectedProfile.value];
  try {
    if (!all) await activateSelected(az);
    await az.resetProfiles(all);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), true);
    return;
  }
  log('sy', t('reset.log', { list: indices.map((i) => t('nav.profileN', { n: i + 1 })).join(', ') }));
  resetProfileSettings(indices);
  await run(indices, t(all ? 'reset.doneAll' : 'reset.doneOne', { n: selectedProfile.value + 1 }));
}

export const syncCurrentProfile = (): Promise<void> => run([selectedProfile.value]);
export const syncAllProfiles = (): Promise<void> => run(Array.from({ length: PROFILE_COUNT }, (_, i) => i));
