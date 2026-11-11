/** Power settings, as on the vendor page. All three are read back from 12 01. */

/** sleep timeout codes: 1, 2, 3, 5, 10 minutes, never (labels: i18n sleep.<code>) */
export const SLEEP_CODES = [0, 1, 2, 3, 4, 255] as const;
/** low-battery warning thresholds in %, 0 = never */
export const LOW_BATTERY_LEVELS = [0, 10, 20, 30, 40, 50] as const;
export const SAVING = { OFF: 0, LIGHTS_OFF: 1, DIM: 2 } as const;
export const SAVING_MODES = [SAVING.LIGHTS_OFF, SAVING.DIM] as const;

/** 51 38: sleep after idle */
export const sleepCmd = (code: number): number[] => [0x51, 0x38, 0x00, 0x00, code];
/** 51 39: power saving (0 off / 1 lights off / 2 dim) */
export const powerSavingCmd = (mode: number): number[] => [0x51, 0x39, 0x00, 0x00, mode];
/**
 * 51 3A: low-battery light warning %.
 * (51 37, used by some third-party tools for this, is the *mouse* power command and is rejected.)
 */
export const lowBatteryCmd = (pct: number): number[] => [0x51, 0x3a, 0x00, 0x00, pct];
