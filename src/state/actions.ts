/**
 * User actions that change the keyboard. Each one writes to the device (when online),
 * records the new setting in the profile store and updates live status.
 */
import { signal } from '@preact/signals';
import { currentEffect, device, info, oledContent, online, pollingRate, power } from './connection';
import { attempt, toast } from './feedback';
import { current, deviceSerial, selectedProfile, updateCurrent, updateEffect } from './profiles';
import { EFFECTS, defaultLighting, type Azoth, type EffectSettings } from '../devices/azoth';
import { t } from '../i18n';
import { keyLabel } from '../i18n/labels';
import { debounce } from '../util/storage';
import { putBlob } from '../util/blobStore';
import { toGreyFrames } from '../media/decode';
import { imageBinary } from '../media/gray4';
import { setImageSource } from './oledImage';
import { librarySource, type LibraryEntry } from './imageLibrary';

/** IndexedDB key of the last OLED image uploaded to this keyboard for a profile */
export const imageKey = (profile: number): string => `oled-image-${deviceSerial.value}-p${profile}`;
/** key used before images were kept per keyboard */
export const legacyImageKey = (profile: number): string => `oled-image-p${profile}`;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------- saving to flash
export type SaveState = 'idle' | 'pending' | 'saved' | 'error';
export const saveState = signal<SaveState>('idle');
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Lighting changes stream in instantly; persist to flash once the user stops for 1.5 s. */
function scheduleSave(): void {
  saveState.value = 'pending';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await device.value?.save();
      saveState.value = 'saved';
    } catch (e) {
      saveState.value = 'error';
      toast(errText(e), true);
    }
  }, 1500);
}

// ---------------------------------------------------------------- profiles
export async function selectProfile(index: number): Promise<void> {
  const az = device.value;
  if (az && online.value && info.value?.profile !== index) {
    const ok = await attempt(() => az.setProfile(index), t('toast.profileSwitched', { n: index + 1 }));
    if (ok !== undefined && info.value) info.value = { ...info.value, profile: index };
  }
  selectedProfile.value = index;
}

/** Factory resets act on the keyboard's active profile: make sure that's the one shown. */
export async function activateSelected(az: Azoth): Promise<void> {
  const p = selectedProfile.value;
  if (info.value?.profile === p) return;
  await az.setProfile(p);
  if (info.value) info.value = { ...info.value, profile: p };
}

// ---------------------------------------------------------------- lighting (instant)
const sendLighting = debounce(async () => {
  const az = device.value;
  if (!az || !online.value) return;
  try {
    const lighting = current.value.lighting;
    await az.applyLighting(lighting);
    currentEffect.value = lighting.effect;
    scheduleSave();
  } catch (e) {
    toast(errText(e), true);
  }
}, 150);

/** bumps on every lighting change so the preview restarts like the keyboard does */
export const lightingRevision = signal(0);

export function selectEffect(id: number): void {
  updateCurrent((p) => (p.lighting.effect = id));
  lightingRevision.value++;
  sendLighting();
}
export function changeEffect(patch: Partial<EffectSettings>): void {
  updateEffect(current.value.lighting.effect, patch);
  lightingRevision.value++;
  sendLighting();
}

/**
 * Factory-reset this profile's lighting, then write the app's defaults for every effect
 * (the selected one last), like the vendor page does, so keyboard and page agree.
 */
export async function resetLighting(): Promise<void> {
  const az = device.value;
  if (!az || !online.value) return;
  await attempt(async () => {
    await activateSelected(az);
    await az.resetLighting();
    const lighting = defaultLighting();
    updateCurrent((p) => (p.lighting = lighting));
    lightingRevision.value++;
    for (const e of [...EFFECTS.filter((e) => e.id !== lighting.effect), EFFECTS.find((e) => e.id === lighting.effect)!])
      await az.applyLighting({ ...lighting, effect: e.id });
    await az.save();
    currentEffect.value = lighting.effect;
  }, t('toast.lightingReset'));
}

// ---------------------------------------------------------------- keys (instant)
export async function mapKey(source: number, target: number): Promise<void> {
  const az = device.value;
  if (!az) return;
  const ok = source === target ? t('toast.keyRestored', { key: keyLabel(source) }) : t('toast.keyMapped', { src: keyLabel(source), dst: keyLabel(target) });
  await attempt(async () => {
    await az.bindKey(source, target);
    await az.save();
    updateCurrent((p) => {
      if (source === target) delete p.keyMap[source];
      else p.keyMap[source] = target;
    });
  }, ok);
}

export async function restoreAllKeys(): Promise<void> {
  const az = device.value;
  const keys = Object.keys(current.value.keyMap).map(Number);
  if (!az) return;
  if (!keys.length) return toast(t('toast.noMappedKeys'));
  await attempt(async () => {
    for (const k of keys) await az.bindKey(k, k);
    await az.save();
    updateCurrent((p) => (p.keyMap = {}));
  }, t('toast.keysRestored', { n: keys.length }));
}

// ---------------------------------------------------------------- OLED
export async function setOledPower(on: boolean): Promise<void> {
  const az = device.value;
  if (az && (await attempt(() => az.oledPower(on))) !== undefined) updateCurrent((p) => (p.oled.on = on));
}
export async function setOledBrightness(pct: number): Promise<void> {
  const az = device.value;
  if (az && (await attempt(() => az.oledBrightness(pct))) !== undefined) updateCurrent((p) => (p.oled.brightness = pct));
}
export async function showPreset(index: number): Promise<void> {
  updateCurrent((p) => {
    p.oled.mode = 'preset';
    p.oled.preset = index;
  });
  const az = device.value;
  if (!az || !online.value) return;
  if ((await attempt(() => az.oledPreset(index), t('toast.presetShown', { n: index + 1 }))) !== undefined)
    oledContent.value = { kind: 'preset', index };
}
export async function showClock(sync = false): Promise<void> {
  const az = device.value;
  if (!az || !online.value) return;
  if ((await attempt(() => az.oledClock(current.value.oled.clock24h), t(sync ? 'toast.timeSynced' : 'toast.clockShown'))) !== undefined)
    oledContent.value = { kind: 'clock' };
}

export type Progress = (sent: number, total: number) => void;

export async function uploadImage(binary: Uint8Array, onProgress: Progress): Promise<boolean> {
  const az = device.value;
  if (!az) return false;
  const t0 = performance.now();
  const n = await attempt(() => az.uploadImage(binary, onProgress));
  if (n === undefined) return false;
  updateCurrent((p) => (p.oled.mode = 'image'));
  void putBlob(imageKey(selectedProfile.value), binary); // kept for "sync settings"
  oledContent.value = { kind: 'image' };
  toast(t('toast.uploaded', { n, s: ((performance.now() - t0) / 1000).toFixed(1) }));
  return true;
}

/** Put a library image back on the current profile; with `upload`, also send it to the keyboard. */
export async function applyLibraryEntry(entry: LibraryEntry, upload: boolean, onProgress: Progress = () => {}): Promise<boolean> {
  const src = await librarySource(entry);
  if (!src) {
    toast(t('library.missing'), true);
    return false;
  }
  const doc = await setImageSource(selectedProfile.value, src);
  if (!doc) return false;
  updateCurrent((p) => (p.oled.mode = 'image'));
  if (!upload) return true;
  const frames = toGreyFrames(doc.img, { placement: doc.committed, invert: doc.invert, gamma: doc.gamma });
  return uploadImage(imageBinary(frames, doc.img.animated || frames.length > 1), onProgress);
}

export async function uploadBanner(w: number, h: number, data: Uint8Array, onProgress: Progress): Promise<boolean> {
  const az = device.value;
  if (!az) return false;
  const b = current.value.oled.banner;
  const n = await attempt(() => az.uploadBanner(b.pattern, b.layout, w, h, data, onProgress));
  if (n === undefined) return false;
  updateCurrent((p) => (p.oled.mode = 'banner'));
  oledContent.value = { kind: 'banner' };
  toast(t('toast.bannerUploaded', { n }));
  return true;
}

// keep the clock accurate while the page is open (optional)
let clockTimer: ReturnType<typeof setInterval> | undefined;
export const clockAutoSync = signal(false);
export function setClockAutoSync(on: boolean): void {
  clockAutoSync.value = on;
  clearInterval(clockTimer);
  if (on) {
    void showClock(true);
    clockTimer = setInterval(() => {
      if (online.value) void device.value?.oledClock(current.value.oled.clock24h, true).catch(() => undefined);
    }, 60_000);
  }
}

// ---------------------------------------------------------------- power (global)
export async function setSleep(code: number): Promise<void> {
  const az = device.value;
  if (az && (await attempt(() => az.setSleep(code), t('toast.sleepSet'))) !== undefined && power.value)
    power.value = { ...power.value, idle: code };
}
export async function setLowBattery(pct: number): Promise<void> {
  const az = device.value;
  if (az && (await attempt(() => az.setLowBattery(pct), t('toast.lowSet'))) !== undefined && power.value)
    power.value = { ...power.value, lowBattery: pct };
}
export async function setPowerSaving(mode: number): Promise<void> {
  const az = device.value;
  if (az && (await attempt(() => az.setPowerSaving(mode), t('toast.savingSet'))) !== undefined && power.value)
    power.value = { ...power.value, saving: mode };
}

/** Azoth X with a Booster only (experimental) */
export async function setPollingRate(index: number): Promise<void> {
  const az = device.value;
  if (az && (await attempt(() => az.setPollingRate(index), t('toast.pollingSet'))) !== undefined) pollingRate.value = index;
}
