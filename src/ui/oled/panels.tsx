/** The four OLED content panels: presets, image/GIF, banner, clock. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BANNER_H, BANNER_PATTERN_COUNT, BANNER_STRIP_H, OLED_H, OLED_W, PRESET_COUNT } from '../../devices/azoth/oled';
import { BANNER_FONTS, BANNER_LAYOUTS, BANNER_SIZES, BANNER_STYLES, renderBanner } from '../../media/banner';
import { toGreyFrames } from '../../media/decode';
import { drawPlaced, imageBinary, pack4, type FitMode, type Placement } from '../../media/gray4';
import { current, deviceSerial, selectedProfile, updateCurrent } from '../../state/profiles';
import {
  applyPreset, commitPlacement, dragImage, ensureImageLoaded, imageDocFor, imageError, imageSourceOf, loadImageFile, setImageAdjust,
  setZoomPercent, zoomImage, zoomPercent,
} from '../../state/oledImage';
import { applyLibraryEntry, clockAutoSync, setClockAutoSync, showClock, showPreset, uploadBanner, uploadImage } from '../../state/actions';
import { ensureLibrary, library, removeFromLibrary, saveToLibrary, signature } from '../../state/imageLibrary';
import { addEditorSource } from '../../state/editor';
import { toast } from '../../state/feedback';
import { page } from '../../state/ui';
import { device } from '../../state/connection';
import { Card, ConfirmButton, Row, Seg } from '../common/controls';
import { artRevision, assetUrl, drawClock, drawMessage, drawPattern, hasPatternArt, loadPresetFrames } from './art';
import type { PreviewInteraction, Scene } from './OledPreview';
import { t, type MessageKey } from '../../i18n';

// ---------------------------------------------------------------- presets
export function PresetPanel() {
  const sel = current.value.oled.preset;
  return (
    <Card title={t('oled.mode.preset')}>
      <div class="presets">
        {Array.from({ length: PRESET_COUNT }, (_, i) => (
          <button key={i} class={`preset ${i === sel ? 'sel' : ''}`} onClick={() => void showPreset(i)}>
            <img src={assetUrl(`preset-${i}.jpg`)} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
            <span>{t('oled.presetN', { n: i + 1 })}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function usePresetScene(index: number): Scene {
  const [frames, setFrames] = useState<Awaited<ReturnType<typeof loadPresetFrames>>>(null);
  useEffect(() => {
    let alive = true;
    setFrames(null);
    void loadPresetFrames(index).then((f) => alive && setFrames(f));
    return () => {
      alive = false;
    };
  }, [index]);
  if (!frames)
    return { key: `preset-${index}`, frames: 1, draw: (ctx) => drawMessage(ctx, `PRESET ${index + 1}`, '#ddd', 'bold 16px sans-serif') };
  return {
    key: `preset-${index}-art`,
    frames: frames.length,
    delays: frames.map((f) => f.ms),
    draw: (ctx, i) => ctx.drawImage(frames[i].bitmap, 0, 0, OLED_W, OLED_H),
  };
}

// ---------------------------------------------------------------- image / GIF
/** View of the current profile's image document (state lives in state/oledImage, survives reconnects). */
export function useImageState() {
  const profile = selectedProfile.value;
  useEffect(() => void ensureImageLoaded(profile), [profile, deviceSerial.value]);
  const doc = imageDocFor(profile) ?? null;
  const frames = useMemo(
    () => (doc ? toGreyFrames(doc.img, { placement: doc.committed, invert: doc.invert, gamma: doc.gamma }) : null),
    [doc?.img, doc?.committed, doc?.invert, doc?.gamma],
  );
  return {
    doc,
    source: doc ? { img: doc.img, name: doc.name } : null,
    frames,
    preset: doc ? doc.preset : 'crop',
    placement: doc?.placement ?? ({ kind: 'stretch' } as Placement),
    committed: doc?.committed ?? ({ kind: 'stretch' } as Placement),
    live: !!doc && doc.placement !== doc.committed,
    invert: doc?.invert ?? false,
    gamma: doc?.gamma ?? 1,
    zoomPercent: doc ? zoomPercent(doc) : 100,
    error: imageError.value,
    load: (f: File) => loadImageFile(profile, f),
    applyPreset: (m: FitMode) => applyPreset(profile, m),
    drag: (dx: number, dy: number) => dragImage(profile, dx, dy),
    commit: () => commitPlacement(profile),
    zoom: (f: number) => zoomImage(profile, f),
    setZoomPercent: (pct: number) => setZoomPercent(profile, pct),
    setInvert: (invert: boolean) => setImageAdjust(profile, { invert }),
    setGamma: (gamma: number) => setImageAdjust(profile, { gamma }),
  };
}
export type ImageStateHook = ReturnType<typeof useImageState>;

/** Drag / wheel handlers for the preview, when the image can be moved. */
export const imageInteraction = (st: ImageStateHook): PreviewInteraction | undefined =>
  st.source && st.placement.kind === 'free' ? { onDrag: st.drag, onDragEnd: st.commit, onZoom: st.zoom } : undefined;

export function imageScene(st: ImageStateHook): Scene {
  const src = st.source;
  if (!src) return { key: 'image-empty', frames: 1, draw: (ctx) => drawMessage(ctx, t('oled.placeholder')) };

  // while moving: draw the first frame directly (fast), greyed by the canvas filter
  if (st.live) {
    const p = st.placement;
    const bmp = src.img.frames[0].bitmap;
    return {
      key: `image-live-${JSON.stringify(p)}-${st.invert}`,
      frames: 1,
      draw: (ctx) => {
        ctx.filter = st.invert ? 'grayscale(1) invert(1)' : 'grayscale(1)';
        drawPlaced(ctx, bmp, p);
        ctx.filter = 'none';
      },
    };
  }

  const frames = st.frames;
  if (!frames) return { key: 'image-empty', frames: 1, draw: (ctx) => drawMessage(ctx, t('oled.placeholder')) };
  const data = new ImageData(OLED_W, OLED_H);
  return {
    key: `image-${src.name}-${frames.length}-${JSON.stringify(st.committed)}-${st.invert}-${st.gamma}`,
    frames: frames.length,
    delays: frames.map((f) => f.ms),
    draw: (ctx, i) => {
      const lv = frames[i].levels;
      for (let p = 0; p < lv.length; p++) {
        const v = lv[p] * 17;
        data.data[p * 4] = data.data[p * 4 + 1] = data.data[p * 4 + 2] = v;
        data.data[p * 4 + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
    },
  };
}

export function ImagePanel({ st }: { st: ImageStateHook }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const frames = st.frames;
  const animated = !!st.source && (st.source.img.animated || (frames?.length ?? 0) > 1);
  const binary = useMemo(() => (frames ? imageBinary(frames, animated) : null), [frames, animated]);
  const total = frames?.reduce((s, f) => s + f.ms, 0) ?? 0;

  return (
    <Card title={t('image.title')} sub={t('image.sub')}>
      <div
        class={`drop ${over ? 'over' : ''}`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer?.files[0];
          if (f) void st.load(f);
        }}
      >
        {t('image.drop')}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void st.load(f); }} />
      </div>
      <Row label={t('image.fit')}>
        <Seg options={(['crop', 'fit', 'stretch'] as const).map((f) => [f, t(`image.fit.${f}` as MessageKey)] as const)} value={st.preset} onChange={(m) => st.applyPreset(m)} />
        <label>
          <input type="checkbox" checked={st.invert} onChange={(e) => st.setInvert((e.currentTarget as HTMLInputElement).checked)} /> {t('image.invert')}
        </label>
      </Row>
      {st.source && st.placement.kind === 'free' && (
        <>
          <Row label={t('image.zoom')}>
            <input type="range" min={10} max={400} step={1} value={st.zoomPercent} onInput={(e) => st.setZoomPercent(+(e.currentTarget as HTMLInputElement).value)} />
            <span class="val">{st.zoomPercent}%</span>
          </Row>
          <p class="hint">{t('image.dragHint')}</p>
        </>
      )}
      <Row label={t('image.gamma')}>
        <input type="range" min={0.4} max={2.2} step={0.1} value={st.gamma} onChange={(e) => st.setGamma(+(e.currentTarget as HTMLInputElement).value)} />
        <span class="val">{st.gamma.toFixed(1)}</span>
      </Row>
      <p class="hint">
        {st.error ||
          (frames && st.source
            ? t('image.info', { name: st.source.name, frames: frames.length, ms: total, bytes: binary?.length ?? 0 }) +
              (st.source.img.frames.length > frames.length ? t('image.sampled', { n: st.source.img.frames.length }) : '')
            : t('image.none'))}
      </p>
      <Row>
        <button
          class="primary"
          disabled={!binary || !device.value || !!progress}
          onClick={async () => {
            setProgress([0, 1]);
            await uploadImage(binary!, (i, n) => setProgress([i, n]));
            setProgress(null);
          }}
        >
          {t('upload.button')}
        </button>
        <button
          disabled={!st.doc}
          title={t('image.openEditorHint')}
          onClick={async () => {
            const d = st.doc!;
            if (await addEditorSource(d.bytes, d.type, d.name, { placement: d.committed, gamma: d.gamma, invert: d.invert })) page.value = 'editor';
          }}
        >
          {t('image.openEditor')}
        </button>
        {progress && <progress value={progress[0]} max={progress[1]} />}
      </Row>
    </Card>
  );
}

/** Images saved on purpose, shared by all profiles: put one back with a click. */
export function LibraryPanel({ st }: { st: ImageStateHook }) {
  useEffect(() => void ensureLibrary(), []);
  const items = library.value;
  const [busy, setBusy] = useState<{ id: string; pct: number } | null>(null);
  const doc = st.doc;
  const currentSig = useMemo(() => (doc ? signature(imageSourceOf(doc)) : null), [doc?.bytes, doc?.committed, doc?.invert, doc?.gamma]);
  const saved = !!items?.some((e) => e.sig === currentSig);
  return (
    <Card
      title={t('library.title')}
      sub={t('library.sub')}
      actions={
        <button
          disabled={!doc || !st.frames || saved}
          onClick={async () => {
            const ok = await saveToLibrary(imageSourceOf(doc!), st.frames![0].levels, st.frames!.length);
            toast(t(ok ? 'library.saved' : 'library.duplicate'));
          }}
        >
          {saved ? t('library.alreadySaved') : t('library.save')}
        </button>
      }
    >
      {!items?.length ? (
        <p class="hint">{t('library.empty')}</p>
      ) : (
        <div class="library">
          {items.map((e) => (
            <div key={e.id} class={`lib-item ${e.sig === currentSig ? 'sel' : ''}`}>
              <button class="lib-thumb" title={t('library.useHint')} disabled={!!busy} onClick={() => void applyLibraryEntry(e, false)}>
                <img src={e.thumb} alt="" />
              </button>
              <div class="lib-meta">
                <span class="lib-name" title={e.name}>{e.name}</span>
                <span class="muted">{e.frames > 1 ? t('library.frames', { n: e.frames }) : t('library.still')}</span>
              </div>
              <div class="lib-actions">
                <button
                  title={t('library.uploadHint')}
                  disabled={!device.value || !!busy}
                  onClick={async () => {
                    setBusy({ id: e.id, pct: 0 });
                    await applyLibraryEntry(e, true, (i, n) => setBusy({ id: e.id, pct: Math.round((i / n) * 100) }));
                    setBusy(null);
                  }}
                >
                  {busy?.id === e.id ? `${busy.pct}%` : t('library.upload')}
                </button>
                <ConfirmButton disabled={!!busy} onConfirm={() => void removeFromLibrary(e.id)}>
                  {t('library.delete')}
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- banner
export function bannerScene(): Scene {
  const b = current.value.oled.banner;
  const r = renderBanner(b);
  const strip = new OffscreenCanvas(OLED_W, BANNER_STRIP_H);
  drawPattern(strip.getContext('2d')!, b.pattern, OLED_W, BANNER_STRIP_H);
  return {
    key: `banner-${JSON.stringify(b)}-${artRevision.value}`,
    frames: 1,
    draw: (ctx) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OLED_W, OLED_H);
      ctx.drawImage(strip, 0, 0);
      ctx.drawImage(r.canvas, 0, 0, OLED_W, BANNER_H, 0, BANNER_STRIP_H, OLED_W, BANNER_H);
    },
  };
}

function PatternButton({ index, selected }: { index: number; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rev = artRevision.value;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawPattern(ctx, index, 208, 18);
  }, [index, rev]);
  return (
    <button class={selected ? 'sel' : ''} title={t(`pattern.${index}` as MessageKey)} onClick={() => updateCurrent((p) => (p.oled.banner.pattern = index))}>
      <canvas ref={ref} width={208} height={18} />
    </button>
  );
}

export function BannerPanel() {
  const b = current.value.oled.banner;
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const rendered = useMemo(() => renderBanner(b), [b]);
  const set = (patch: Partial<typeof b>) => updateCurrent((p) => (p.oled.banner = { ...p.oled.banner, ...patch }));
  const overflow = rendered.w > OLED_W || rendered.h > BANNER_H;
  artRevision.value; // re-render when local artwork loads

  return (
    <Card title={t('oled.mode.banner')} sub={t('banner.sub')}>
      <Row label={t('banner.pattern')}>
        <div class="patterns">
          {Array.from({ length: BANNER_PATTERN_COUNT }, (_, i) => (
            <PatternButton key={i} index={i} selected={b.pattern === i} />
          ))}
        </div>
      </Row>
      <p class="hint">
        {t(hasPatternArt() ? 'banner.artLocal' : 'banner.artApprox')}
      </p>
      <Row label={t('banner.text')} style="align-items:flex-start">
        <textarea maxLength={200} placeholder={t('banner.placeholder')} value={b.text} onInput={(e) => set({ text: (e.currentTarget as HTMLTextAreaElement).value })} />
      </Row>
      <Row label={t('banner.font')}>
        <select value={b.font} onChange={(e) => set({ font: (e.currentTarget as HTMLSelectElement).value })}>
          {BANNER_FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <span class="muted">{t('banner.size')}</span>
        <select value={b.size} onChange={(e) => set({ size: +(e.currentTarget as HTMLSelectElement).value })}>
          {BANNER_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('banner.style')}>
        <Seg options={BANNER_STYLES.map((v) => [v, t(`bannerStyle.${v}` as MessageKey)] as const)} value={b.style} onChange={(style) => set({ style })} />
      </Row>
      <Row label={t('banner.layout')}>
        <Seg options={BANNER_LAYOUTS.map((v) => [v, t(`bannerLayout.${v}` as MessageKey)] as const)} value={b.layout} onChange={(layout) => set({ layout })} />
      </Row>
      <p class="hint">
        {t('banner.info', { w: rendered.w, h: rendered.h, bytes: (rendered.w * rendered.h) / 2 })}
        {rendered.clipped && t('banner.clipped')}
        {overflow && t('banner.overflow')}
      </p>
      <Row>
        <button
          class="primary"
          disabled={!device.value || !!progress}
          onClick={async () => {
            const data = new Uint8Array((rendered.w * rendered.h) / 2);
            pack4(rendered.levels, data);
            setProgress([0, 1]);
            await uploadBanner(rendered.w, rendered.h, data, (i, n) => setProgress([i, n]));
            setProgress(null);
          }}
        >
          {t('upload.button')}
        </button>
        {progress && <progress value={progress[0]} max={progress[1]} />}
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------- clock
export const clockScene = (use24h: boolean): Scene => ({
  key: `clock-${use24h}`,
  frames: 1,
  refreshMs: 1000,
  draw: (ctx) => drawClock(ctx, use24h),
});

export function ClockPanel() {
  const use24h = current.value.oled.clock24h;
  return (
    <Card title={t('oled.mode.clock')}>
      <Row label={t('clock.format')}>
        <Seg
          options={[[true, t('clock.24h')], [false, t('clock.12h')]]}
          value={use24h}
          onChange={(v) => {
            updateCurrent((p) => (p.oled.clock24h = v));
            void showClock(true);
          }}
        />
      </Row>
      <Row label={t('clock.sync')}>
        <button onClick={() => void showClock(true)}>{t('clock.syncNow')}</button>
        <label>
          <input type="checkbox" checked={clockAutoSync.value} onChange={(e) => setClockAutoSync((e.currentTarget as HTMLInputElement).checked)} /> {t('clock.auto')}
        </label>
      </Row>
      <p class="hint">{t('clock.hint')}</p>
    </Card>
  );
}
