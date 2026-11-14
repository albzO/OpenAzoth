/**
 * Per-profile settings. The keyboard can't report key maps, lighting colours or OLED content,
 * so the app keeps its own record of what it wrote, per keyboard (serial number) and profile,
 * in localStorage.
 */
import { computed, signal } from '@preact/signals';
import { defaultLighting, type EffectSettings, type LightingState } from '../devices/azoth/lighting';
import type { BannerSettings } from '../media/banner';
import { BANNER_SIZES } from '../media/banner';
import { debounce, load, remove, save } from '../util/storage';

export type OledMode = 'preset' | 'image' | 'banner' | 'clock';

export interface OledSettings {
  on: boolean;
  brightness: number;
  mode: OledMode;
  preset: number;
  banner: BannerSettings;
  clock24h: boolean;
}

export interface ProfileSettings {
  lighting: LightingState;
  oled: OledSettings;
  /** source key code → target code, only keys changed from default */
  keyMap: Record<number, number>;
  /** control lever; the keyboard can't report it, so only what was set here (absent = factory default) */
  lever: LeverSettings;
}

export interface LeverSettings {
  /** mode → on/off (absent = on) */
  enabled: Record<number, boolean>;
  /** custom-mode direction → target code (absent = default) */
  map: Record<number, number>;
}

export const PROFILE_COUNT = 6;
const STORAGE_KEY = 'profiles';
export const SCHEMA_VERSION = 1;

export const defaultProfile = (): ProfileSettings => ({
  lighting: defaultLighting(),
  oled: {
    on: true,
    brightness: 100,
    mode: 'preset',
    preset: 0,
    banner: { pattern: 2, text: 'AZOTH', font: 'ROG Fonts', style: 0, size: 20, layout: 1 },
    clock24h: true,
  },
  keyMap: {},
  lever: { enabled: {}, map: {} },
});

interface Stored {
  version: number;
  profiles: ProfileSettings[];
}

/** Bring stored data up to the current schema; unknown/broken data falls back to defaults. */
export function migrate(raw: unknown): ProfileSettings[] {
  const stored = raw as Partial<Stored> | null;
  const list = Array.isArray(stored?.profiles) ? stored!.profiles : [];
  return Array.from({ length: PROFILE_COUNT }, (_, i) => {
    const d = defaultProfile();
    const p = list[i] as Partial<ProfileSettings> | undefined;
    if (!p) return d;
    const banner = { ...d.oled.banner, ...(p.oled?.banner ?? {}) };
    if (!BANNER_SIZES.includes(banner.size)) banner.size = 20;
    return {
      lighting: { effect: p.lighting?.effect ?? 0, fx: { ...d.lighting.fx, ...(p.lighting?.fx ?? {}) } },
      oled: { ...d.oled, ...(p.oled ?? {}), banner },
      keyMap: { ...(p.keyMap ?? {}) },
      lever: { enabled: { ...(p.lever?.enabled ?? {}) }, map: { ...(p.lever?.map ?? {}) } },
    };
  });
}

// ---------------------------------------------------------------- per keyboard
/**
 * Settings are stored per keyboard, keyed by its serial number (read on connect).
 * Before any keyboard has been seen, the last one used is assumed.
 */
const UNKNOWN_SERIAL = 'unknown';
export const deviceSerial = signal<string>(load('lastSerial', UNKNOWN_SERIAL));
const keyFor = (serial: string) => `${STORAGE_KEY}.${serial}`;

/** Load a keyboard's profiles. Data saved before per-keyboard storage goes to the first keyboard seen. */
function loadProfiles(serial: string): ProfileSettings[] {
  let raw = load<unknown>(keyFor(serial), null);
  if (raw === null && serial !== UNKNOWN_SERIAL) {
    const legacy = load<unknown>(STORAGE_KEY, null) ?? load<unknown>(keyFor(UNKNOWN_SERIAL), null);
    if (legacy !== null) {
      raw = legacy;
      save(keyFor(serial), legacy);
      remove(STORAGE_KEY);
      remove(keyFor(UNKNOWN_SERIAL));
    }
  }
  return migrate(raw);
}

export const profiles = signal<ProfileSettings[]>(loadProfiles(deviceSerial.value));
/** profile shown in the UI (0-based) */
export const selectedProfile = signal(0);
export const current = computed(() => profiles.value[selectedProfile.value]);

const writeNow = () => save(keyFor(deviceSerial.value), { version: SCHEMA_VERSION, profiles: profiles.value } satisfies Stored);
const persist = debounce(writeNow, 300);

/** Switch to another keyboard's settings (called after reading the serial on connect). */
export function useKeyboard(serial: string): void {
  if (serial === deviceSerial.value) return;
  writeNow(); // flush the current keyboard first
  deviceSerial.value = serial;
  save('lastSerial', serial);
  profiles.value = loadProfiles(serial);
}

/** Immutable update of one profile; the callback may mutate the draft copy. */
export function updateProfile(index: number, mutate: (draft: ProfileSettings) => void): void {
  const next = profiles.value.slice();
  const draft = structuredClone(next[index]);
  mutate(draft);
  next[index] = draft;
  profiles.value = next;
  persist();
}
/** Put profiles back to the app's defaults (after a factory reset on the keyboard). */
export function resetProfileSettings(indices: number[]): void {
  const next = profiles.value.slice();
  for (const i of indices) next[i] = defaultProfile();
  profiles.value = next;
  persist();
}
export const updateCurrent = (mutate: (draft: ProfileSettings) => void): void => updateProfile(selectedProfile.value, mutate);

/** Patch the settings of one lighting effect in the current profile. */
export function updateEffect(effect: number, patch: Partial<EffectSettings>): void {
  updateCurrent((p) => {
    p.lighting.fx[effect] = { ...p.lighting.fx[effect], ...patch };
  });
}
