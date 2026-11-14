/**
 * The control lever (up / press / down).
 *
 * Commands from ASUS Gear Link's Azoth page (v1.00.22). Verified on an Azoth via the Omni receiver, firmware
 * 4.00.18: 22 01 (current mode), 71 00 (mode on/off: switched-off modes are skipped by the side
 * button) and 71 01 (custom-mode mapping) work; 25 0B and 25 0C (reading them back) are rejected
 * with ff aa. The firmware modes are fixed functions; the custom mode's three directions are
 * mapped like any key, with the same key codes as the key remapping table.
 */
import { u16, type Bytes } from '../../util/bytes';
import { MOUSE } from './keys';

/** the lever's three directions, as key codes */
export const LEVER = { UP: 0xa4, PRESS: 0xa5, DOWN: 0xa6 } as const;
export const LEVER_SOURCES = [LEVER.UP, LEVER.PRESS, LEVER.DOWN] as const;
/** what the custom mode does out of the box (the vendor page's "default") */
export const LEVER_DEFAULT: Record<number, number> = {
  [LEVER.UP]: MOUSE.scrollUp,
  [LEVER.PRESS]: MOUSE.middle,
  [LEVER.DOWN]: MOUSE.scrollDown,
};

/**
 * Firmware modes (labels: i18n lever.mode.<n>). 5 and 6 are motherboard / AIO fan control, which
 * need Armoury Crate; the vendor page greys them out, so they aren't offered here.
 */
export const LEVER_MODES = [0, 1, 2, 3, 4, 7] as const;
/** the custom mode */
export const LEVER_CUSTOM = 7;
/** index the custom-mapping commands carry (7; verified working on hardware) */
export const LEVER_MAP_INDEX = 7;

/** 22 01: current mode at [4] */
export const CMD_LEVER_MODE = [0x22, 0x01];
export const parseLeverMode = (r: Bytes): number => r[4];

/** 25 0B: one byte per mode at [4..11], 1 = enabled */
export const CMD_LEVER_STATE = [0x25, 0x0b];
export const parseLeverState = (r: Bytes): boolean[] => Array.from({ length: 8 }, (_, i) => r[4 + i] === 1);

/** 71 00: enable / disable a mode */
export const leverEnableCmd = (mode: number, on: boolean): number[] => [0x71, 0x00, 0x00, 0x00, mode, on ? 1 : 0];

/** 25 0C: read what a direction is mapped to in the custom mode; target at [4..5] */
export const leverReadCmd = (source: number, index = LEVER_MAP_INDEX): number[] => [0x25, 0x0c, 0x00, 0x00, index, source & 0xff, source >> 8];
export const parseLeverTarget = (r: Bytes): number => u16(r, 4);

/** 71 01: map a direction in the custom mode */
export const leverBindCmd = (source: number, target: number, index = LEVER_MAP_INDEX): number[] => [
  0x71, 0x01, 0x00, 0x00, index, source & 0xff, source >> 8, target & 0xff, target >> 8,
];
