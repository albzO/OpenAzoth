/**
 * Read-only queries and their reply layouts.
 * Offsets are into the reply payload WITHOUT the report-ID byte.
 */
import { u16, u32, versionString } from '../../util/bytes';

export const CMD_DEVICE_INFO = [0x12, 0x00];
export const CMD_POWER = [0x12, 0x01];
export const CMD_LAYOUT = [0x12, 0x12];
export const CMD_OLED_ANIMATION = [0x21, 0x00];
/** persist the current settings to the keyboard's flash */
export const CMD_SAVE = [0x50, 0x55];
/**
 * Factory resets, as sent by the vendor page (50 40 / 50 60 / 50 61). They act on the keyboard's
 * active profile, except 50 40 with 1, which resets all six.
 */
export const CMD_RESET_LIGHTING = [0x50, 0x61, 0x00, 0x00];
export const CMD_RESET_KEYS = [0x50, 0x60, 0x00, 0x00];
export const resetProfilesCmd = (all: boolean): number[] => [0x50, 0x40, 0x00, 0x00, all ? 1 : 0];

export interface DeviceInfo {
  /** firmware of the keyboard itself */
  keyboardFw: string;
  /** firmware of the receiver when connected through one, otherwise null */
  receiverFw: string | null;
  /** 0-based profile index */
  profile: number;
  /** lighting effect id currently running (0xF1 = driven by software) */
  effect: number;
}

/**
 * 12 00 reply: [4..7] u32 version A, [9] effect, [10] profile (1–6, 6 means index 0), [11..14] u32 version B.
 * Wired: A = keyboard. Through a receiver: A = receiver, B = keyboard.
 */
export function parseDeviceInfo(r: Uint8Array, viaReceiver: boolean): DeviceInfo {
  const a = versionString(u32(r, 4));
  const b = versionString(u32(r, 11));
  return {
    keyboardFw: viaReceiver ? b : a,
    receiverFw: viaReceiver ? a : null,
    profile: r[10] === 6 ? 0 : r[10],
    effect: r[9],
  };
}

/** For a receiver queried on its own: is a keyboard linked (version B present)? */
export const receiverLinked = (r: Uint8Array): boolean => u32(r, 11) !== 0;
export const receiverFirmware = (r: Uint8Array): string => versionString(u32(r, 4));

export interface PowerState {
  battery: number;
  /** sleep timeout code, see SLEEP_OPTIONS */
  idle: number;
  /** 0 off, 1 lights off, 2 dim */
  saving: number;
  charging: boolean;
  /** low-battery light warning threshold in % (0 = never) */
  lowBattery: number;
  /** probably battery voltage in mV (rises while charging) */
  millivolts: number;
}

/** 12 01 reply: [5] battery %, [6] idle, [7] saving, [8] charging, [9] low-battery %, [11..12] mV */
export function parsePower(r: Uint8Array): PowerState {
  return {
    battery: r[5],
    idle: r[6],
    saving: r[7],
    charging: r[8] === 1,
    lowBattery: r[9],
    millivolts: u16(r, 11),
  };
}

/** 12 12 reply: [5] layout code (17 on the test unit; meaning not documented) */
export const parseLayout = (r: Uint8Array): number => r[5];

/** 21 00 reply: [4] OLED animation (0–5 presets, 6 custom) */
export const parseOledAnimation = (r: Uint8Array): number => r[4];

export const setProfileCmd = (index: number): number[] => [0x51, 0x00, 0x00, 0x00, index];

/** 12 14 02: the keyboard's serial number (same through a receiver) */
export const CMD_SERIAL = [0x12, 0x14, 0x02, 0x00];

/** Reply [4..15]: ASCII serial, ended by the first non-printable byte. Null if empty. */
export function parseSerial(r: Uint8Array): string | null {
  let s = '';
  for (let i = 4; i < 16 && i < r.length; i++) {
    if (r[i] < 32 || r[i] > 126) break;
    s += String.fromCharCode(r[i]);
  }
  return s || null;
}
