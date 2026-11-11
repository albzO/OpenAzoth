/** Communication log and toast messages. */
import { signal } from '@preact/signals';
import type { LogKind } from '../hid/transport';

export interface LogEntry {
  id: number;
  time: string;
  kind: LogKind;
  text: string;
}

const MAX_LOG = 500;
let logId = 0;
export const logEntries = signal<LogEntry[]>([]);
export const logEnabled = signal(true);

export function log(kind: LogKind, text: string): void {
  if (!logEnabled.value) return;
  const entry = { id: ++logId, time: new Date().toLocaleTimeString(), kind, text };
  logEntries.value = [...logEntries.value.slice(-(MAX_LOG - 1)), entry];
}
export const clearLog = (): void => {
  logEntries.value = [];
};

export interface Toast {
  id: number;
  text: string;
  error: boolean;
}
let toastId = 0;
export const toastMessage = signal<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, error = false): void {
  toastMessage.value = { id: ++toastId, text, error };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMessage.value = null), 2800);
}

/** Run a device action and report failures as a toast. */
export async function attempt<T>(fn: () => Promise<T>, okText?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (okText) toast(okText);
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log('er', msg); // keep it in the traffic log; the toast disappears
    toast(msg, true);
    return undefined;
  }
}
