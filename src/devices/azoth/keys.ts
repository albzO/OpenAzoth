/** Key codes (the keyboard's own AT-style numbering), the Azoth 75% layout and remap command. */

export const KEY: Record<string, number> = {
  Esc: 0x6e, F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79, F11: 0x7a, F12: 0x7b,
  '`': 0x01, '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05, '5': 0x06, '6': 0x07, '7': 0x08, '8': 0x09, '9': 0x0a, '0': 0x0b, '-': 0x0c, '=': 0x0d, Backspace: 0x0f,
  Tab: 0x10, Q: 0x11, W: 0x12, E: 0x13, R: 0x14, T: 0x15, Y: 0x16, U: 0x17, I: 0x18, O: 0x19, P: 0x1a, '[': 0x1b, ']': 0x1c, '\\': 0x1d,
  Caps: 0x1e, A: 0x1f, S: 0x20, D: 0x21, F: 0x22, G: 0x23, H: 0x24, J: 0x25, K: 0x26, L: 0x27, ';': 0x28, "'": 0x29, '#': 0x2a, Enter: 0x2b,
  Shift: 0x2c, '<': 0x2d, Z: 0x2e, X: 0x2f, C: 0x30, V: 0x31, B: 0x32, N: 0x33, M: 0x34, ',': 0x35, '.': 0x36, '/': 0x37, 'R Shift': 0x39,
  Ctrl: 0x3a, Win: 0x3b, Alt: 0x3c, Space: 0x3d, 'R Alt': 0x3e, 'R Ctrl': 0x40, Menu: 0x41, 'R Win': 0x80,
  Ins: 0x4b, Del: 0x4c, '←': 0x4f, Home: 0x50, End: 0x51, '↑': 0x53, '↓': 0x54, PgUp: 0x55, PgDn: 0x56, '→': 0x59,
  PrtSc: 0x7c, ScrLk: 0x7d, Pause: 0x7e,
  Num: 0x5a, 'Num 7': 0x5b, 'Num 4': 0x5c, 'Num 1': 0x5d, 'Num /': 0x5f, 'Num 8': 0x60, 'Num 5': 0x61, 'Num 2': 0x62, 'Num 0': 0x63,
  'Num *': 0x64, 'Num 9': 0x65, 'Num 6': 0x66, 'Num 3': 0x67, 'Num .': 0x68, 'Num -': 0x69, 'Num +': 0x6a, 'Num Enter': 0x6c,
};

/** media targets by id (labels: i18n media.<id>) */
export const MEDIA = {
  playPause: 0xb7, stop: 0xb6, next: 0xb5, prev: 0xb4, mute: 0xb8, volUp: 0xbb, volDown: 0xbc,
} as const;

/** mouse targets by id (labels: i18n mouse.<id>) */
export const MOUSE = {
  left: 0x01f0, right: 0x01f1, middle: 0x01f2, scrollUp: 0x01e8, scrollDown: 0x01e9,
} as const;

export type TargetGroupId = 'letters' | 'symbols' | 'function' | 'nav' | 'modifiers' | 'numpad' | 'media' | 'mouse';
const keys = (names: string[]) => names.map((k) => KEY[k]);

/** remap targets, grouped (group titles: i18n group.<id>) */
export const TARGET_GROUPS: readonly { id: TargetGroupId; codes: number[] }[] = [
  { id: 'letters', codes: keys('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) },
  { id: 'symbols', codes: keys(['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/', '#', '<']) },
  { id: 'function', codes: keys(['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrtSc', 'ScrLk', 'Pause']) },
  { id: 'nav', codes: keys(['Backspace', 'Tab', 'Enter', 'Space', 'Caps', 'Ins', 'Del', 'Home', 'End', 'PgUp', 'PgDn', '↑', '↓', '←', '→']) },
  { id: 'modifiers', codes: keys(['Ctrl', 'Shift', 'Alt', 'Win', 'R Ctrl', 'R Shift', 'R Alt', 'R Win', 'Menu']) },
  { id: 'numpad', codes: keys(['Num', 'Num /', 'Num *', 'Num -', 'Num +', 'Num Enter', 'Num .', 'Num 0', 'Num 1', 'Num 2', 'Num 3', 'Num 4', 'Num 5', 'Num 6', 'Num 7', 'Num 8', 'Num 9']) },
  { id: 'media', codes: Object.values(MEDIA) },
  { id: 'mouse', codes: Object.values(MOUSE) },
];

/** What a code means: a keyboard key (label = its key cap), or a media / mouse target id. */
export type KeyTarget = { kind: 'key'; name: string } | { kind: 'media'; id: keyof typeof MEDIA } | { kind: 'mouse'; id: keyof typeof MOUSE } | { kind: 'raw'; code: number };
const BY_CODE = new Map<number, KeyTarget>([
  ...Object.entries(KEY).map(([name, c]) => [c, { kind: 'key', name }] as [number, KeyTarget]),
  ...Object.entries(MEDIA).map(([id, c]) => [c, { kind: 'media', id }] as [number, KeyTarget]),
  ...Object.entries(MOUSE).map(([id, c]) => [c, { kind: 'mouse', id }] as [number, KeyTarget]),
]);
export const describeCode = (code: number): KeyTarget => BY_CODE.get(code) ?? { kind: 'raw', code };

/** Azoth 75% ANSI layout: [label, width in key units]. "Fn" has no code and can't be remapped. */
export const LAYOUT: readonly (readonly [string, number])[][] = [
  [['Esc', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1]],
  [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['Backspace', 2], ['Ins', 1]],
  [['Tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.5], ['Del', 1]],
  [['Caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['Enter', 2.25], ['PgUp', 1]],
  [['Shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['R Shift', 1.75], ['↑', 1], ['PgDn', 1]],
  [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['Space', 6.25], ['R Alt', 1], ['Fn', 1], ['R Ctrl', 1], ['←', 1], ['↓', 1], ['→', 1]],
];

/** 51 20 <source> 00 <target u16 LE>; then save. Mapping a key to itself restores it. */
export const keyBindCmd = (source: number, target: number): number[] => [0x51, 0x20, source, 0x00, target & 0xff, target >> 8];
