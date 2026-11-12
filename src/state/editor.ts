/**
 * OLED canvas editor: a small project of image / GIF layers on one timeline, rendered to the
 * 208×64 16-level screen and exported as one GIF. Global (not per keyboard or profile), kept in
 * IndexedDB so it survives reloads.
 */
import { computed, signal } from '@preact/signals';
import { decodeImage, type DecodedFrame } from '../media/decode';
import { coverScale, type GreyFrame, type Placement } from '../media/gray4';
import { frameStep, loopMs, renderTimeline, type Adjust, type Timing, type Transform } from '../media/compose';
import { encodeGreyGif } from '../media/gif';
import { OLED_H, OLED_W } from '../devices/azoth/oled';
import { getValue, putValue } from '../util/blobStore';
import { t } from '../i18n';
import { toast } from './feedback';
import { selectedProfile, updateCurrent } from './profiles';
import { loadImageBytes, type ImageSource } from './oledImage';
import { saveToLibrary } from './imageLibrary';
import { uploadImage, type Progress } from './actions';
import { imageBinary } from '../media/gray4';

export interface EditorLayer extends Transform, Timing, Adjust {
  id: string;
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
  frames: DecodedFrame[];
}
type StoredLayer = Omit<EditorLayer, 'frames'>;
interface StoredProject {
  layers: StoredLayer[];
  duration: number;
  interval: number;
}

const STORE_KEY = 'oled-editor';
export const MAX_DURATION = 60000;

/** bottom layer first */
export const layers = signal<EditorLayer[]>([]);
export const duration = signal(2000);
export const interval = signal(100);
export const selectedId = signal<string | null>(null);
export const playhead = signal(0);
export const playing = signal(false);
export const editorReady = signal(false);
export const editorError = signal('');

export const selectedLayer = computed(() => layers.value.find((l) => l.id === selectedId.value) ?? null);
/** the step and frame count that will actually be exported */
export const output = computed(() => frameStep(duration.value, interval.value));

const newId = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- persistence
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist(): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const stored: StoredProject = {
      layers: layers.value.map(({ frames: _f, ...rest }) => rest),
      duration: duration.value,
      interval: interval.value,
    };
    void putValue(STORE_KEY, stored);
  }, 500);
}

let loading: Promise<void> | null = null;
export function ensureEditorLoaded(): Promise<void> {
  loading ??= (async () => {
    const s = await getValue<StoredProject>(STORE_KEY);
    if (s?.layers) {
      const out: EditorLayer[] = [];
      for (const l of s.layers) {
        try {
          const img = await decodeImage(new Blob([l.bytes], { type: l.type }));
          out.push({ ...l, frames: img.frames });
        } catch {
          /* a source that no longer decodes is dropped */
        }
      }
      // anything added while loading goes on top
      layers.value = [...out, ...layers.value];
      duration.value = s.duration;
      interval.value = s.interval;
    }
    editorReady.value = true;
  })();
  return loading;
}

// ---------------------------------------------------------------- layers
export interface SourceSettings {
  placement?: Placement;
  gamma?: number;
  invert?: boolean;
}

/** Add an image / GIF as the new top layer, filling the screen (or at the given placement). */
export async function addEditorSource(bytes: Uint8Array<ArrayBuffer>, type: string, name: string, s: SourceSettings = {}): Promise<boolean> {
  editorError.value = '';
  await ensureEditorLoaded();
  let frames: DecodedFrame[];
  try {
    frames = (await decodeImage(new Blob([bytes], { type }))).frames;
  } catch (e) {
    editorError.value = t('image.decodeFailed', { msg: e instanceof Error ? e.message : String(e) });
    return false;
  }
  const bmp = frames[0].bitmap;
  const animated = frames.length > 1;
  const loop = loopMs(frames);

  if (!layers.value.length) {
    // the first layer sets the timeline: its own loop (animations) or two seconds (stills)
    duration.value = animated ? Math.min(MAX_DURATION, Math.max(100, loop)) : 2000;
    const delays = frames.map((f) => f.ms).sort((a, b) => a - b);
    interval.value = animated ? Math.max(20, Math.round(delays[delays.length >> 1] / 10) * 10) : 100;
    playhead.value = 0;
  } else if (animated && loop > duration.value) {
    setDuration(Math.min(MAX_DURATION, loop));
  }

  const p = s.placement;
  const transform: Transform =
    p?.kind === 'free' ? { x: p.x, y: p.y, scale: p.scale, rotation: 0 } : { x: 0, y: 0, scale: coverScale(bmp), rotation: 0 };
  const layer: EditorLayer = {
    id: newId(),
    name,
    type,
    bytes,
    frames,
    ...transform,
    start: 0,
    length: duration.value,
    trimIn: 0,
    speed: 1,
    opacity: 1,
    gamma: s.gamma ?? 1,
    invert: s.invert ?? false,
    visible: true,
  };
  layers.value = [...layers.value, layer];
  selectedId.value = layer.id;
  persist();
  return true;
}

export async function addEditorFiles(files: Iterable<File>): Promise<void> {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    await addEditorSource(new Uint8Array(await f.arrayBuffer()), f.type, f.name);
  }
}

export function updateLayer(id: string, patch: Partial<EditorLayer>): void {
  layers.value = layers.value.map((l) => (l.id === id ? { ...l, ...patch } : l));
  persist();
}

export function removeLayer(id: string): void {
  layers.value = layers.value.filter((l) => l.id !== id);
  if (selectedId.value === id) selectedId.value = layers.value[layers.value.length - 1]?.id ?? null;
  persist();
}

/** dir +1 = one step up (towards the front) */
export function moveLayer(id: string, dir: 1 | -1): void {
  const list = layers.value.slice();
  const i = list.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  layers.value = list;
  persist();
}

export function clearEditor(): void {
  layers.value = [];
  selectedId.value = null;
  playhead.value = 0;
  playing.value = false;
  persist();
}

/** Fit presets for the selected layer. */
export function fitLayer(id: string, mode: 'fill' | 'fit' | 'center'): void {
  const l = layers.value.find((x) => x.id === id);
  if (!l) return;
  const bmp = l.frames[0].bitmap;
  if (mode === 'center') return updateLayer(id, { x: 0, y: 0 });
  const scale = mode === 'fill' ? coverScale(bmp) : Math.min(OLED_W / bmp.width, OLED_H / bmp.height);
  updateLayer(id, { x: 0, y: 0, rotation: 0, scale });
}

// ---------------------------------------------------------------- timeline
/** Change the total length; layers that ran to the old end keep running to the new end. */
export function setDuration(ms: number): void {
  const d = Math.round(Math.min(MAX_DURATION, Math.max(20, ms)));
  const old = duration.value;
  layers.value = layers.value.map((l) => (l.start + l.length === old && d > l.start ? { ...l, length: d - l.start } : l));
  duration.value = d;
  if (playhead.value >= d) playhead.value = 0;
  persist();
}

export function setInterval_(ms: number): void {
  interval.value = Math.max(20, Math.min(1000, Math.round(ms / 10) * 10));
  persist();
}

// ---------------------------------------------------------------- output
export const renderOutput = (): GreyFrame[] => renderTimeline(layers.value, duration.value, interval.value);

function outputName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `canvas-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.gif`;
}

function outputSource(frames: GreyFrame[]): ImageSource {
  return {
    name: outputName(),
    type: 'image/gif',
    bytes: encodeGreyGif(frames, OLED_W, OLED_H),
    preset: 'crop',
    placement: { kind: 'free', scale: 1, x: 0, y: 0 },
    invert: false,
    gamma: 1,
  };
}

export function downloadGif(): void {
  const src = outputSource(renderOutput());
  const url = URL.createObjectURL(new Blob([src.bytes], { type: 'image/gif' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = src.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveEditorToLibrary(): Promise<void> {
  const frames = renderOutput();
  const ok = await saveToLibrary(outputSource(frames), frames[0].levels, frames.length);
  toast(t(ok ? 'library.saved' : 'library.duplicate'));
}

/** Make the result the current profile's OLED image and upload it. */
export async function uploadEditor(onProgress: Progress): Promise<boolean> {
  const frames = renderOutput();
  const src = outputSource(frames);
  await loadImageBytes(selectedProfile.value, src.bytes, src.type, src.name);
  updateCurrent((p) => (p.oled.mode = 'image'));
  return uploadImage(imageBinary(frames, frames.length > 1), onProgress);
}
