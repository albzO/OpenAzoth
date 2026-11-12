/**
 * The OLED image editor's document, one per profile: the original file, where it sits on the
 * screen and the grey adjustments. Kept in a module-level signal (survives the UI unmounting on
 * disconnect) and in IndexedDB (survives reloads).
 *
 * `placement` follows the pointer while dragging; `committed` is what gets converted to grey frames.
 */
import { signal } from '@preact/signals';
import { decodeImage, type DecodedImage } from '../media/decode';
import { coverScale, presetPlacement, zoomPlacement, type FitMode, type Placement } from '../media/gray4';
import { deleteValue, getValue, putValue } from '../util/blobStore';
import { t } from '../i18n';
import { deviceSerial } from './profiles';

export interface ImageDoc {
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
  img: DecodedImage;
  /** fit preset last applied, null after manual moving/zooming */
  preset: FitMode | null;
  placement: Placement;
  committed: Placement;
  invert: boolean;
  gamma: number;
}

/** what goes to IndexedDB (the decoded frames are rebuilt from bytes) */
interface StoredDoc {
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
  preset: FitMode | null;
  placement: Placement;
  invert: boolean;
  gamma: number;
}

/** "<serial>:<profile>" → document; null = known to have none; missing = not loaded yet */
export const imageDocs = signal<Record<string, ImageDoc | null>>({});
export const imageError = signal('');

const docKey = (profile: number) => `${deviceSerial.value}:${profile}`;
const storageKey = (profile: number) => `oled-source-${deviceSerial.value}-p${profile}`;
/** stored before images were kept per keyboard */
const legacyKey = (profile: number) => `oled-source-p${profile}`;
const loading = new Set<string>();

/** The current keyboard's document for a profile (undefined while loading). */
export const imageDocFor = (profile: number): ImageDoc | null | undefined => imageDocs.value[docKey(profile)];

function update(profile: number, patch: Partial<ImageDoc>): ImageDoc | null {
  const cur = imageDocs.value[docKey(profile)];
  if (!cur) return null;
  const next = { ...cur, ...patch };
  imageDocs.value = { ...imageDocs.value, [docKey(profile)]: next };
  return next;
}

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
function persist(profile: number): void {
  const k = docKey(profile);
  const sk = storageKey(profile); // captured now, in case the keyboard changes before the timer fires
  clearTimeout(persistTimers.get(k));
  persistTimers.set(
    k,
    setTimeout(() => {
      const d = imageDocs.value[k];
      if (!d) void deleteValue(sk);
      else
        void putValue(sk, {
          name: d.name, type: d.type, bytes: d.bytes, preset: d.preset, placement: d.committed, invert: d.invert, gamma: d.gamma,
        } satisfies StoredDoc);
    }, 400),
  );
}

/** Load a profile's saved image (once). */
export async function ensureImageLoaded(profile: number): Promise<void> {
  const k = docKey(profile);
  if (k in imageDocs.value || loading.has(k)) return;
  loading.add(k);
  try {
    let s = await getValue<StoredDoc>(storageKey(profile));
    if (!s) {
      // move an image saved before per-keyboard storage to this keyboard
      s = await getValue<StoredDoc>(legacyKey(profile));
      if (s) {
        await putValue(storageKey(profile), s);
        await deleteValue(legacyKey(profile));
      }
    }
    let doc: ImageDoc | null = null;
    if (s?.bytes) {
      const img = await decodeImage(new Blob([s.bytes], { type: s.type }));
      doc = { ...s, img, committed: s.placement };
    }
    if (!(k in imageDocs.value)) imageDocs.value = { ...imageDocs.value, [k]: doc };
  } catch {
    imageDocs.value = { ...imageDocs.value, [k]: null };
  } finally {
    loading.delete(k);
  }
}

/** An image with its settings, as stored per profile and in the image library. */
export type ImageSource = StoredDoc;

/** Replace a profile's image with a source (file bytes + settings). Returns the new document. */
export async function setImageSource(profile: number, src: ImageSource): Promise<ImageDoc | null> {
  imageError.value = '';
  try {
    const img = await decodeImage(new Blob([src.bytes], { type: src.type }));
    const doc: ImageDoc = { ...src, img, committed: src.placement };
    imageDocs.value = { ...imageDocs.value, [docKey(profile)]: doc };
    persist(profile);
    return doc;
  } catch (e) {
    imageError.value = t('image.decodeFailed', { msg: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function loadImageBytes(profile: number, bytes: Uint8Array<ArrayBuffer>, type: string, name: string): Promise<ImageDoc | null> {
  imageError.value = '';
  try {
    const img = await decodeImage(new Blob([bytes], { type }));
    const p = presetPlacement(img.frames[0].bitmap, 'crop');
    const doc: ImageDoc = { name, type, bytes, img, preset: 'crop', placement: p, committed: p, invert: false, gamma: 1 };
    imageDocs.value = { ...imageDocs.value, [docKey(profile)]: doc };
    persist(profile);
    return doc;
  } catch (e) {
    imageError.value = t('image.decodeFailed', { msg: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function loadImageFile(profile: number, file: File): Promise<void> {
  await loadImageBytes(profile, new Uint8Array(await file.arrayBuffer()), file.type, file.name);
}

/** The stored form of a document (what the library keeps). */
export const imageSourceOf = (d: ImageDoc): ImageSource => ({
  name: d.name, type: d.type, bytes: d.bytes, preset: d.preset, placement: d.committed, invert: d.invert, gamma: d.gamma,
});

export function applyPreset(profile: number, mode: FitMode): void {
  const d = imageDocs.value[docKey(profile)];
  if (!d) return;
  const p = presetPlacement(d.img.frames[0].bitmap, mode);
  update(profile, { preset: mode, placement: p, committed: p });
  persist(profile);
}

export function dragImage(profile: number, dx: number, dy: number): void {
  const d = imageDocs.value[docKey(profile)];
  if (!d || d.placement.kind !== 'free') return;
  update(profile, { preset: null, placement: { ...d.placement, x: d.placement.x + dx, y: d.placement.y + dy } });
}

export function commitPlacement(profile: number): void {
  const d = imageDocs.value[docKey(profile)];
  if (!d || d.committed === d.placement) return;
  update(profile, { committed: d.placement });
  persist(profile);
}

const commitTimers = new Map<number, ReturnType<typeof setTimeout>>();
export function zoomImage(profile: number, factor: number): void {
  const d = imageDocs.value[docKey(profile)];
  if (!d || d.placement.kind !== 'free') return;
  update(profile, { preset: null, placement: zoomPlacement(d.placement, factor) });
  clearTimeout(commitTimers.get(profile));
  commitTimers.set(profile, setTimeout(() => commitPlacement(profile), 250));
}

/** zoom as a percentage of the "crop to fill" scale */
export function zoomPercent(d: ImageDoc): number {
  return d.placement.kind === 'free' ? Math.round((d.placement.scale / coverScale(d.img.frames[0].bitmap)) * 100) : 100;
}
export function setZoomPercent(profile: number, pct: number): void {
  const d = imageDocs.value[docKey(profile)];
  if (!d || d.placement.kind !== 'free') return;
  zoomImage(profile, (coverScale(d.img.frames[0].bitmap) * pct) / 100 / d.placement.scale);
}

export function setImageAdjust(profile: number, patch: { invert?: boolean; gamma?: number }): void {
  if (update(profile, patch)) persist(profile);
}
