/**
 * Image library: images / GIFs the user saved on purpose, shared by every keyboard and profile
 * on this computer, so a previous picture can be put back in one click.
 * IndexedDB: an index (names, settings, thumbnails) plus one entry per image's bytes.
 */
import { signal } from '@preact/signals';
import { OLED_H, OLED_W } from '../devices/azoth/oled';
import { deleteValue, getValue, putValue } from '../util/blobStore';
import type { ImageSource } from './oledImage';

export interface LibraryEntry extends Omit<ImageSource, 'bytes'> {
  id: string;
  /** PNG data URL of the first converted frame */
  thumb: string;
  frames: number;
  size: number;
  /** content + settings fingerprint, to spot duplicates */
  sig: string;
  savedAt: number;
}

const INDEX_KEY = 'oled-library';
const dataKey = (id: string) => `oled-library-${id}`;

/** null while not loaded */
export const library = signal<LibraryEntry[] | null>(null);
let loading: Promise<void> | null = null;

export function ensureLibrary(): Promise<void> {
  loading ??= getValue<LibraryEntry[]>(INDEX_KEY).then((v) => {
    library.value = Array.isArray(v) ? v : [];
  });
  return loading;
}

/** FNV-1a over the bytes, plus the settings that change the result. */
export function signature(src: ImageSource): string {
  let h = 0x811c9dc5;
  const b = src.bytes;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return `${(h >>> 0).toString(16)}-${b.length}-${JSON.stringify(src.placement)}-${src.invert}-${src.gamma}`;
}

/** First frame (0–15 levels) as a PNG data URL. */
export function thumbnail(levels: Uint8Array): string {
  const c = document.createElement('canvas');
  c.width = OLED_W;
  c.height = OLED_H;
  const ctx = c.getContext('2d')!;
  const d = ctx.createImageData(OLED_W, OLED_H);
  for (let i = 0; i < levels.length; i++) {
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = levels[i] * 17;
    d.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}

/** Save; returns false when the same image with the same settings is already there. */
export async function saveToLibrary(src: ImageSource, firstFrame: Uint8Array, frames: number): Promise<boolean> {
  await ensureLibrary();
  const sig = signature(src);
  if (library.value!.some((e) => e.sig === sig)) return false;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { bytes, ...meta } = src;
  const entry: LibraryEntry = { ...meta, id, thumb: thumbnail(firstFrame), frames, size: bytes.length, sig, savedAt: Date.now() };
  await putValue(dataKey(id), bytes);
  library.value = [entry, ...library.value!];
  await putValue(INDEX_KEY, library.value);
  return true;
}

export async function removeFromLibrary(id: string): Promise<void> {
  await ensureLibrary();
  library.value = library.value!.filter((e) => e.id !== id);
  await putValue(INDEX_KEY, library.value);
  await deleteValue(dataKey(id));
}

export async function librarySource(entry: LibraryEntry): Promise<ImageSource | null> {
  const bytes = await getValue<Uint8Array<ArrayBuffer>>(dataKey(entry.id));
  if (!(bytes instanceof Uint8Array)) return null;
  const { name, type, preset, placement, invert, gamma } = entry;
  return { name, type, bytes, preset, placement, invert, gamma };
}
