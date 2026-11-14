/**
 * Control lever. Verified on an Azoth via the Omni receiver (firmware 4.00.18): mode switches (71 00) and the
 * custom-mode mapping (71 01) work and the current mode (22 01) reads back, but the keyboard
 * rejects reading the switches (25 0B) and the mapping (25 0C). So, like key remapping, the page
 * keeps its own per-profile record of what it set; values the keyboard does report win.
 */
import { computed, signal } from '@preact/signals';
import { LEVER_DEFAULT, LEVER_MODES, LEVER_SOURCES } from '../devices/azoth';
import { device } from './connection';
import { attempt } from './feedback';
import { current, updateCurrent } from './profiles';
import { t } from '../i18n';
import { keyLabel } from '../i18n/labels';

/** what the keyboard itself reported (null = rejected / no answer) */
interface LeverRead {
  mode: number | null;
  enabled: boolean[] | null;
  targets: Record<number, number | null>;
}
const read = signal<LeverRead | null>(null);
export const leverBusy = signal(false);

export interface LeverView {
  /** current firmware mode, null if unknown */
  mode: number | null;
  enabled: Record<number, boolean>;
  targets: Record<number, number>;
}

/** keyboard-reported values where available, else the recorded ones, else factory defaults */
export const leverView = computed<LeverView>(() => {
  const r = read.value;
  const rec = current.value.lever;
  const enabled: Record<number, boolean> = {};
  for (const m of LEVER_MODES) enabled[m] = r?.enabled?.[m] ?? rec.enabled[m] ?? true;
  const targets: Record<number, number> = {};
  for (const s of LEVER_SOURCES) targets[s] = r?.targets[s] ?? rec.map[s] ?? LEVER_DEFAULT[s];
  return { mode: r?.mode ?? null, enabled, targets };
});

export function forgetLeverRead(): void {
  read.value = null;
}

export async function readLever(): Promise<void> {
  const az = device.value;
  if (!az || leverBusy.value) return;
  leverBusy.value = true;
  try {
    const mode = await az.readLeverMode();
    // ask once per connection whether the firmware reports the rest; this one doesn't
    const known = read.value;
    const enabled = known && known.enabled === null ? null : await az.readLeverState();
    const targets: Record<number, number | null> = {};
    for (const s of LEVER_SOURCES) targets[s] = known && known.targets[s] === null ? null : await az.readLeverTarget(s);
    read.value = { mode, enabled, targets };
  } finally {
    leverBusy.value = false;
  }
}

export async function setLeverTarget(source: number, target: number, label: string): Promise<void> {
  const az = device.value;
  if (!az) return;
  const ok = await attempt(async () => {
    await az.bindLever(source, target);
    await az.save();
    return true;
  }, t('toast.leverMapped', { src: label, dst: keyLabel(target) }));
  if (!ok) return;
  updateCurrent((p) => {
    if (target === LEVER_DEFAULT[source]) delete p.lever.map[source];
    else p.lever.map[source] = target;
  });
  const r = read.value;
  if (r && r.targets[source] !== null) read.value = { ...r, targets: { ...r.targets, [source]: target } };
}

export async function setLeverModeEnabled(mode: number, on: boolean): Promise<void> {
  const az = device.value;
  if (!az) return;
  const ok = await attempt(async () => {
    await az.enableLeverMode(mode, on);
    await az.save();
    return true;
  }, t('toast.leverModeSet'));
  if (!ok) return;
  updateCurrent((p) => {
    if (on) delete p.lever.enabled[mode];
    else p.lever.enabled[mode] = false;
  });
  const r = read.value;
  if (r?.enabled) {
    const enabled = [...r.enabled];
    enabled[mode] = on;
    read.value = { ...r, enabled };
  }
}

/** Write everything recorded for the current profile to the keyboard again (mode switches + custom mapping). */
export async function rewriteLever(): Promise<void> {
  const az = device.value;
  if (!az || leverBusy.value) return;
  const rec = current.value.lever;
  leverBusy.value = true;
  try {
    await attempt(async () => {
      for (const m of LEVER_MODES) await az.enableLeverMode(m, rec.enabled[m] ?? true);
      for (const s of LEVER_SOURCES) await az.bindLever(s, rec.map[s] ?? LEVER_DEFAULT[s]);
      await az.save();
    }, t('toast.leverRewritten'));
  } finally {
    leverBusy.value = false;
  }
}

/** All modes on, custom mapping back to scroll up / middle click / scroll down. */
export async function resetLever(): Promise<void> {
  const az = device.value;
  if (!az) return;
  const ok = await attempt(async () => {
    for (const m of LEVER_MODES) await az.enableLeverMode(m, true);
    for (const s of LEVER_SOURCES) await az.bindLever(s, LEVER_DEFAULT[s]);
    await az.save();
    return true;
  }, t('toast.leverReset'));
  if (!ok) return;
  updateCurrent((p) => (p.lever = { enabled: {}, map: {} }));
  const r = read.value;
  if (r) {
    read.value = {
      ...r,
      enabled: r.enabled && r.enabled.map(() => true),
      targets: Object.fromEntries(Object.entries(r.targets).map(([s, v]) => [s, v === null ? null : LEVER_DEFAULT[+s]])),
    };
  }
}
