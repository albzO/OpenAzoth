/**
 * Polling rate and the ROG Polling Rate Booster (Azoth X only, experimental).
 *
 * Taken from ASUS Gear Link's Azoth X page (v1.00.36), not yet captured from real hardware:
 * the page only shows its polling-rate setting when the keyboard reports a Booster, and then
 * offers 1000 Hz and 8000 Hz.
 */
import { u16, u32, versionString, type Bytes } from '../../util/bytes';

/** polling-rate index used by the firmware */
export const POLLING = { HZ1000: 0, HZ2000: 1, HZ4000: 2, HZ8000: 3 } as const;
export const POLLING_HZ: Record<number, number> = { 0: 1000, 1: 2000, 2: 4000, 3: 8000 };
/** what the vendor page offers */
export const POLLING_CHOICES = [POLLING.HZ1000, POLLING.HZ8000] as const;

/** 12 15: current polling-rate index at [4] */
export const CMD_POLLING_RATE = [0x12, 0x15];
export const parsePollingRate = (r: Bytes): number | null => (r[4] in POLLING_HZ ? r[4] : null);

/** 51 31: set polling-rate index */
export const pollingRateCmd = (index: number): number[] => [0x51, 0x31, 0x00, 0x00, index];

/** 7D 20 index 2: is a Booster connected ([4] = 1) */
export const CMD_BOOSTER_STATE = [0x7d, 0x20, 0x02, 0x00];
export const parseBoosterConnected = (r: Bytes): boolean => r[4] === 1;

/** 7D 20 index 1: Booster firmware [4..7] u32, VID [8..9], PID [10..11] */
export const CMD_BOOSTER_INFO = [0x7d, 0x20, 0x01, 0x00];
export interface BoosterInfo {
  firmware: string;
  vid: number;
  pid: number;
}
export const parseBoosterInfo = (r: Bytes): BoosterInfo | null =>
  r.length >= 12 ? { firmware: versionString(u32(r, 4)), vid: u16(r, 8), pid: u16(r, 10) } : null;
