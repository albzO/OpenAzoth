/**
 * Connection lifecycle and live device status: connect/disconnect, auto-reconnect,
 * online/offline detection behind a receiver, battery polling and receiver probing.
 * Everything here is stored as data (ids, codes); the UI turns it into text.
 */
import { batch, computed, signal } from '@preact/signals';
import { HidLink, findControlCollection } from '../hid/transport';
import { CONNECTION_KIND, grantedDevices, hidAvailable, isReceiver, isWired, requestDevice, type ConnectionKind } from '../hid/discovery';
import {
  Azoth, CMD_DEVICE_INFO, oledContentFromCode, receiverFirmware, receiverLinked,
  type DeviceInfo, type OledContent, type PowerState,
} from '../devices/azoth';
import { t, type MessageKey } from '../i18n';
import { log, toast } from './feedback';
import { selectedProfile, useKeyboard } from './profiles';
import { load, save } from '../util/storage';

export type KeyboardState = 'none' | 'reading' | 'online' | 'offline';

export const device = signal<Azoth | null>(null);
export const keyboardState = signal<KeyboardState>('none');
/** why we're disconnected (shown in the header) */
export const statusMessage = signal<MessageKey | null>(null);
export const info = signal<DeviceInfo | null>(null);
export const power = signal<PowerState | null>(null);
export const layoutCode = signal<number | null>(null);
/** serial number of the connected keyboard */
export const serialNumber = signal<string | null>(null);
/** effect id the keyboard is running (0xF1 = software controlled) */
export const currentEffect = signal<number | null>(null);
export const oledContent = signal<OledContent | null>(null);
export const receiver = signal<{ present: boolean; firmware: string; linked: boolean | null }>({
  present: false,
  firmware: load('receiverFw', ''),
  linked: null,
});

export const online = computed(() => keyboardState.value === 'online');
export const connectionKind = computed<ConnectionKind | null>(() =>
  device.value ? CONNECTION_KIND[device.value.link.device.productId] : null,
);

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------- reading
export async function refresh(): Promise<boolean> {
  const az = device.value;
  if (!az) return false;
  const di = await az.readDeviceInfo();
  if (!di) return false;
  const pw = await az.readPower();
  const layout = await az.readLayout();
  const anim = await az.readOledAnimation();
  const sn = await az.readSerial();
  batch(() => {
    if (sn) {
      serialNumber.value = sn;
      useKeyboard(sn); // settings are kept per keyboard
    }
    info.value = di;
    if (pw) power.value = pw;
    layoutCode.value = layout;
    if (anim !== null) oledContent.value = oledContentFromCode(anim);
    currentEffect.value = di.effect;
    if (di.receiverFw) {
      receiver.value = { present: true, firmware: di.receiverFw, linked: true };
      save('receiverFw', di.receiverFw);
    }
    selectedProfile.value = di.profile;
  });
  return true;
}

function setOnline(on: boolean): void {
  keyboardState.value = on ? 'online' : 'offline';
  if (!on) {
    info.value = null;
    power.value = null;
    if (device.value?.viaReceiver) receiver.value = { ...receiver.value, linked: false };
    log('sy', t('log.offline'));
  } else log('sy', t('log.online'));
}

// ---------------------------------------------------------------- polling
const POLL_MS = 5000;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let misses = 0;
let tick = 0;

async function poll(): Promise<void> {
  if (++tick % 3 === 0) await probeReceiver();
  const az = device.value;
  if (!az) return;
  const pw = await az.readPower(true);
  if (pw) {
    misses = 0;
    if (!online.value) {
      setOnline(true);
      await refresh();
    } else power.value = pw;
  } else if (++misses >= 2 && online.value) setOnline(false);
}

function startPolling(): void {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => void poll(), POLL_MS);
}

// ---------------------------------------------------------------- receiver (probed separately when wired)
let receiverDevice: HIDDevice | null = null;

async function findReceiver(): Promise<void> {
  receiverDevice = (await grantedDevices()).find(isReceiver) ?? null;
  if (!receiverDevice) receiver.value = { ...receiver.value, present: false, linked: null };
  else if (!receiver.value.present) receiver.value = { ...receiver.value, present: true };
}

async function probeReceiver(): Promise<void> {
  await findReceiver();
  const dev = receiverDevice;
  if (!dev || dev === device.value?.link.device) return;
  const col = findControlCollection(dev);
  if (!col) return;
  try {
    if (!dev.opened) await dev.open();
    const r = await new Promise<Uint8Array | null>((resolve) => {
      const onInput = (e: HIDInputReportEvent) => {
        if (e.reportId !== col.reportId) return;
        const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
        if (d[0] === 0x12 && d[1] === 0x00) done(new Uint8Array(d));
      };
      const done = (v: Uint8Array | null) => {
        dev.removeEventListener('inputreport', onInput);
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => done(null), 1200);
      dev.addEventListener('inputreport', onInput);
      const buf = new Uint8Array(col.length);
      buf.set(CMD_DEVICE_INFO);
      dev.sendReport(col.reportId, buf).catch(() => done(null));
    });
    if (r) {
      const fw = receiverFirmware(r);
      receiver.value = { present: true, firmware: fw, linked: receiverLinked(r) };
      save('receiverFw', fw);
    } else receiver.value = { ...receiver.value, linked: null };
  } catch {
    receiver.value = { ...receiver.value, linked: null };
  }
}

// ---------------------------------------------------------------- other programs on the line
/**
 * Replies we never asked for mean another program (typically Gear Link Companion) is sending
 * commands to the keyboard at the same time, which can break uploads. Late replies to our own
 * timed-out commands are filtered out by the transport, so 2 within 2 minutes is a reliable sign.
 * Warn once per connection.
 */
const COMMAND_REPLIES = new Set([0x12, 0x21, 0x22, 0x23, 0x24, 0x25, 0x50, 0x51, 0x61, 0x62, 0x63, 0x68, 0x69, 0xff]);
let foreignTimes: number[] = [];
let foreignWarned = false;
function watchForeignTraffic(link: HidLink): void {
  foreignTimes = [];
  foreignWarned = false;
  link.onUnsolicited = (d) => {
    if (!COMMAND_REPLIES.has(d[0]) || foreignWarned) return;
    const now = Date.now();
    foreignTimes = [...foreignTimes.filter((x) => now - x < 120_000), now];
    if (foreignTimes.length >= 2) {
      foreignWarned = true;
      log('er', t('warn.foreign'));
      toast(t('warn.foreign'), true);
    }
  };
}

// ---------------------------------------------------------------- attach / detach
async function attach(dev: HIDDevice): Promise<void> {
  if (device.value?.link.device === dev) return;
  await device.value?.link.close();
  const link = await HidLink.open(dev, log);
  watchForeignTraffic(link);
  log('sy', t('log.opened', { name: dev.productName, pid: dev.productId.toString(16), id: link.reportId, len: link.reportLength }));
  batch(() => {
    device.value = new Azoth(link);
    keyboardState.value = 'reading';
    statusMessage.value = null;
  });
  misses = 0;
  setOnline(await refresh().catch(() => false));
  startPolling();
  void probeReceiver();
}

export async function disconnect(reason: MessageKey | null = null): Promise<void> {
  const az = device.value;
  batch(() => {
    device.value = null;
    keyboardState.value = 'none';
    info.value = null;
    power.value = null;
    oledContent.value = null;
    currentEffect.value = null;
    statusMessage.value = reason;
  });
  await az?.link.close();
  await findReceiver();
  startPolling(); // keep watching for the receiver
}

/** Connect to an already-authorised device, preferring the cable. */
export async function autoConnect(): Promise<void> {
  const [best] = await grantedDevices();
  const cur = device.value?.link.device;
  if (best && (!cur || (isWired(best) && !isWired(cur)))) {
    await attach(best).catch((e) => toast(errText(e), true));
  }
}

/** "Connect keyboard" button: show the browser's device picker. */
export async function connectByPicker(): Promise<void> {
  try {
    const dev = await requestDevice();
    if (dev) await attach(dev);
  } catch (e) {
    toast(errText(e), true);
  }
}

export function initConnection(): void {
  if (!hidAvailable()) return;
  navigator.hid.addEventListener('connect', (e) => {
    log('sy', t('log.plugged', { name: e.device.productName }));
    setTimeout(() => {
      void autoConnect();
      void probeReceiver();
    }, 800);
  });
  navigator.hid.addEventListener('disconnect', (e) => {
    if (e.device === device.value?.link.device) {
      log('sy', t('log.unplugged', { name: e.device.productName }));
      toast(t('toast.disconnected'), true);
      void disconnect('status.unplugged').then(() => setTimeout(() => void autoConnect(), 500));
    } else if (e.device === receiverDevice) void findReceiver();
  });
  void autoConnect();
  void findReceiver();
  startPolling();
}
