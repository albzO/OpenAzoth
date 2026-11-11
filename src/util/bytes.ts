/** Small helpers for working with HID byte arrays. */

export type Bytes = ArrayLike<number>;

export const hex = (a: Bytes): string => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(' ');

/** Little-endian u16 at offset. */
export const u16 = (a: Bytes, o: number): number => a[o] | (a[o + 1] << 8);

/** Little-endian u32 at offset (unsigned). */
export const u32 = (a: Bytes, o: number): number =>
  (a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24)) >>> 0;

/** "#rrggbb" → [r, g, b] */
export const rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Firmware version u32 (…00 MM mm pp) → "M.mm.pp", formatted in hex like the vendor tool. */
export const versionString = (v: number): string =>
  v
    ? `${((v >> 16) & 0xff).toString(16)}.${((v >> 8) & 0xff).toString(16).padStart(2, '0')}.${(v & 0xff)
        .toString(16)
        .padStart(2, '0')}`
    : '';
