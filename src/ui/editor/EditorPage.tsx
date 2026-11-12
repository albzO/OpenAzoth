/**
 * OLED canvas editor: layers of images / GIFs on the 208×64 screen with a shared timeline.
 * The stage shows the real 16-level result inside the screen and the layers' off-screen parts faded.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { OLED_H, OLED_W } from '../../devices/azoth/oled';
import { applyTransform, composeLevels, frameAt, layerCorners, loopMs, toLayerSpace } from '../../media/compose';
import { coverScale } from '../../media/gray4';
import {
  addEditorFiles, clearEditor, downloadGif, duration, editorError, ensureEditorLoaded, fitLayer, interval, layers, moveLayer,
  output, playhead, playing, removeLayer, saveEditorToLibrary, selectedId, selectedLayer, setDuration, setInterval_, updateLayer,
  uploadEditor, MAX_DURATION, type EditorLayer,
} from '../../state/editor';
import { device } from '../../state/connection';
import { selectedProfile } from '../../state/profiles';
import { t } from '../../i18n';
import { Card, ConfirmButton, Row } from '../common/controls';

/** margin around the screen (OLED px) and canvas px per OLED px */
const M = 24;
const Z = 4;
const STAGE_W = (OLED_W + 2 * M) * Z;
const STAGE_H = (OLED_H + 2 * M) * Z;
/** grab distance for handles, canvas px */
const GRAB = 16;
const ROT_HANDLE = 30;

const size = (l: EditorLayer) => ({ w: l.frames[0].bitmap.width, h: l.frames[0].bitmap.height });
/** the timeline time actually shown (snapped to an output frame) */
function shownTime(): number {
  const { step, count } = output.value;
  return Math.min(count - 1, Math.floor(playhead.value / step)) * step;
}
const norm180 = (deg: number) => {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return Math.round(d * 10) / 10;
};

// ---------------------------------------------------------------- stage
type Drag =
  | { mode: 'move'; id: string; ox: number; oy: number; x: number; y: number }
  | { mode: 'scale'; id: string; d0: number; s0: number }
  | { mode: 'rotate'; id: string; a0: number; r0: number };

function handles(l: EditorLayer) {
  const { w, h } = size(l);
  const corners = layerCorners(l, w, h).map(([x, y]) => [(x + M) * Z, (y + M) * Z] as [number, number]);
  const r = (l.rotation * Math.PI) / 180;
  const top: [number, number] = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
  const rot: [number, number] = [top[0] + Math.sin(r) * ROT_HANDLE, top[1] - Math.cos(r) * ROT_HANDLE];
  const center: [number, number] = [(OLED_W / 2 + l.x + M) * Z, (OLED_H / 2 + l.y + M) * Z];
  return { corners, top, rot, center };
}

function Stage({ onPick }: { onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const small = useMemo(() => new OffscreenCanvas(OLED_W, OLED_H), []);
  const [over, setOver] = useState(false);
  const ls = layers.value;
  const sel = selectedLayer.value;
  const tq = shownTime();

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#121318';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // the layers as they are, faded, so parts outside the screen can be seen and grabbed
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.filter = 'grayscale(1)';
    ctx.imageSmoothingQuality = 'high';
    for (const l of ls) {
      if (!l.visible) continue;
      const fi = frameAt(l.frames, l, tq);
      if (fi === null) continue;
      const { w, h } = size(l);
      ctx.setTransform(Z, 0, 0, Z, M * Z, M * Z);
      applyTransform(ctx, l, w, h);
      ctx.drawImage(l.frames[fi].bitmap, 0, 0);
    }
    ctx.restore();

    // the real 16-level result
    const levels = composeLevels(ls, tq);
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(OLED_W, OLED_H);
    for (let i = 0; i < levels.length; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = levels[i] * 17;
      img.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, M * Z, M * Z, OLED_W * Z, OLED_H * Z);
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(M * Z - 1, M * Z - 1, OLED_W * Z + 2, OLED_H * Z + 2);

    if (sel) {
      const hd = handles(sel);
      ctx.strokeStyle = '#ff3b47';
      ctx.lineWidth = 2;
      ctx.beginPath();
      hd.corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.moveTo(...hd.top);
      ctx.lineTo(...hd.rot);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const [x, y] of hd.corners) {
        ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.strokeRect(x - 6, y - 6, 12, 12);
      }
      ctx.beginPath();
      ctx.arc(hd.rot[0], hd.rot[1], 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [ls, sel, tq]);

  // pointer: move / scale / rotate the selected layer, or pick another
  useEffect(() => {
    const el = ref.current!;
    let drag: Drag | null = null;
    const pt = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      const cx = ((e.clientX - r.left) * STAGE_W) / r.width;
      const cy = ((e.clientY - r.top) * STAGE_H) / r.height;
      return { cx, cy, ox: cx / Z - M, oy: cy / Z - M, k: STAGE_W / r.width };
    };
    const near = (a: [number, number], x: number, y: number, k: number) => Math.hypot(a[0] - x, a[1] - y) < GRAB * Math.max(1, k * 0.6);
    const target = (p: ReturnType<typeof pt>): { kind: 'rotate' | 'scale' | 'move'; layer: EditorLayer } | null => {
      const sel = selectedLayer.value;
      if (sel) {
        const hd = handles(sel);
        if (near(hd.rot, p.cx, p.cy, p.k)) return { kind: 'rotate', layer: sel };
        if (hd.corners.some((c) => near(c, p.cx, p.cy, p.k))) return { kind: 'scale', layer: sel };
      }
      const tq = shownTime();
      // the selected layer first (it may be under another one), then front to back
      const order = [...(sel ? [sel] : []), ...layers.value.slice().reverse()];
      for (const l of order) {
        if (!l.visible || frameAt(l.frames, l, tq) === null) continue;
        const { w, h } = size(l);
        const { u, v } = toLayerSpace(l, p.ox, p.oy);
        if (Math.abs(u) <= w / 2 && Math.abs(v) <= h / 2) return { kind: 'move', layer: l };
      }
      return null;
    };
    const down = (e: PointerEvent) => {
      if (!layers.value.length) return;
      const p = pt(e);
      const hit = target(p);
      if (!hit) {
        selectedId.value = null;
        return;
      }
      const l = hit.layer;
      selectedId.value = l.id;
      const c = handles(l).center;
      if (hit.kind === 'move') drag = { mode: 'move', id: l.id, ox: p.ox, oy: p.oy, x: l.x, y: l.y };
      else if (hit.kind === 'scale') drag = { mode: 'scale', id: l.id, d0: Math.hypot(p.cx - c[0], p.cy - c[1]), s0: l.scale };
      else drag = { mode: 'rotate', id: l.id, a0: Math.atan2(p.cy - c[1], p.cx - c[0]), r0: l.rotation };
      el.setPointerCapture(e.pointerId);
      el.focus();
    };
    const move = (e: PointerEvent) => {
      const p = pt(e);
      if (!drag) {
        const hit = layers.value.length ? target(p) : null;
        el.style.cursor = !hit ? 'default' : hit.kind === 'move' ? 'move' : hit.kind === 'scale' ? 'nwse-resize' : 'grab';
        return;
      }
      const l = layers.value.find((x) => x.id === drag!.id);
      if (!l) return;
      if (drag.mode === 'move') {
        updateLayer(l.id, { x: Math.round((drag.x + p.ox - drag.ox) * 2) / 2, y: Math.round((drag.y + p.oy - drag.oy) * 2) / 2 });
      } else {
        const c = handles(l).center;
        if (drag.mode === 'scale') {
          const d = Math.hypot(p.cx - c[0], p.cy - c[1]);
          if (drag.d0 > 0) updateLayer(l.id, { scale: Math.max(0.005, (drag.s0 * d) / drag.d0) });
        } else {
          let r = drag.r0 + ((Math.atan2(p.cy - c[1], p.cx - c[0]) - drag.a0) * 180) / Math.PI;
          if (e.shiftKey) r = Math.round(r / 15) * 15;
          updateLayer(l.id, { rotation: norm180(r) });
        }
      }
    };
    const up = () => {
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      const l = selectedLayer.value;
      if (!l) return;
      e.preventDefault();
      updateLayer(l.id, { scale: Math.max(0.005, l.scale * Math.exp(-e.deltaY * 0.0015)) });
    };
    const key = (e: KeyboardEvent) => {
      const l = selectedLayer.value;
      if (!l) return;
      const n = e.shiftKey ? 10 : 1;
      const d: Record<string, [number, number]> = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] };
      if (d[e.key]) {
        e.preventDefault();
        updateLayer(l.id, { x: l.x + d[e.key][0], y: l.y + d[e.key][1] });
      } else if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) {
        updateLayer(l.id, { flipX: !l.flipX });
      } else if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
        updateLayer(l.id, { flipY: !l.flipY });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeLayer(l.id);
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('keydown', key);
    };
  }, []);

  return (
    <div
      class={`stage ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer?.files.length) void addEditorFiles(e.dataTransfer.files);
      }}
    >
      <canvas ref={ref} width={STAGE_W} height={STAGE_H} tabIndex={0} />
      {!ls.length && (
        <button class="stage-empty" onClick={onPick}>
          {t('editor.empty')}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- playback
function usePlayback() {
  useEffect(() => {
    if (!playing.value) return;
    let raf = 0;
    const t0 = performance.now();
    const p0 = playhead.value;
    const tick = () => {
      const { step, count } = output.value;
      const total = step * count;
      playhead.value = (p0 + performance.now() - t0) % total;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing.value]);
}

// ---------------------------------------------------------------- timeline
function NumberInput(props: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; width?: number }) {
  return (
    <input
      type="number"
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      value={props.value}
      style={{ width: `${props.width ?? 84}px` }}
      onChange={(e) => {
        const v = +(e.currentTarget as HTMLInputElement).value;
        if (Number.isFinite(v)) props.onChange(v);
      }}
    />
  );
}

type BarDrag = { mode: 'body' | 'left' | 'right'; id: string; x0: number; width: number; start: number; length: number; trimIn: number };

function TrackBar({ l, d }: { l: EditorLayer; d: number }) {
  const total = loopMs(l.frames);
  // where the source loops, in % of the bar
  const ticks: number[] = [];
  if (l.frames.length > 1 && total > 0) {
    const loopT = total / l.speed;
    const first = ((total - (((l.trimIn % total) + total) % total)) % total) / l.speed || loopT;
    for (let x = first; x < l.length && ticks.length < 60; x += loopT) ticks.push((x / l.length) * 100);
  }
  const begin = (mode: BarDrag['mode']) => (e: PointerEvent) => {
    e.stopPropagation();
    selectedId.value = l.id;
    const el = e.currentTarget as HTMLElement;
    const track = el.closest('.tl-track') as HTMLElement;
    const drag: BarDrag = { mode, id: l.id, x0: e.clientX, width: track.clientWidth, start: l.start, length: l.length, trimIn: l.trimIn };
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const snap = ev.altKey ? 1 : output.value.step;
      const dms = Math.round((((ev.clientX - drag.x0) / drag.width) * d) / snap) * snap;
      const minLen = output.value.step;
      if (drag.mode === 'body') updateLayer(drag.id, { start: Math.max(0, Math.min(d - minLen, drag.start + dms)) });
      else if (drag.mode === 'right') updateLayer(drag.id, { length: Math.max(minLen, drag.length + dms) });
      else {
        const start = Math.max(0, Math.min(drag.start + drag.length - minLen, drag.start + dms));
        const moved = start - drag.start;
        updateLayer(drag.id, { start, length: drag.length - moved, trimIn: Math.max(0, drag.trimIn + moved * l.speed) });
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div
      class={`tl-bar ${selectedId.value === l.id ? 'sel' : ''} ${l.visible ? '' : 'hidden'}`}
      style={{ left: `${(l.start / d) * 100}%`, width: `${(l.length / d) * 100}%` }}
      onPointerDown={begin('body')}
    >
      {ticks.map((x) => (
        <i key={x} style={{ left: `${x}%` }} />
      ))}
      <span>{l.name}</span>
      <b class="edge left" onPointerDown={begin('left')} />
      <b class="edge right" onPointerDown={begin('right')} />
    </div>
  );
}

function Ruler({ d }: { d: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const tick = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000].find((s) => d / s <= 12) ?? 10000;
  const marks: number[] = [];
  for (let x = 0; x <= d; x += tick) marks.push(x);
  const seek = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    playhead.value = Math.max(0, Math.min(d - 1, ((clientX - r.left) / r.width) * d));
  };
  return (
    <div
      class="tl-ruler"
      ref={ref}
      onPointerDown={(e) => {
        playing.value = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) seek(e.clientX);
      }}
    >
      {marks.map((m) => (
        <span key={m} style={{ left: `${(m / d) * 100}%` }}>
          {m >= 1000 ? `${m / 1000}s` : m}
        </span>
      ))}
      <i class="tl-head" style={{ left: `${(shownTime() / d) * 100}%` }} />
    </div>
  );
}

function Timeline() {
  const d = duration.value;
  const { step, count } = output.value;
  const ls = layers.value.slice().reverse(); // front layer on top, like the stage
  const ph = shownTime();
  return (
    <Card title={t('editor.timeline')}>
      <Row>
        <button class="primary" disabled={!layers.value.length} onClick={() => (playing.value = !playing.value)}>
          {playing.value ? t('editor.pause') : t('editor.play')}
        </button>
        <span class="val tl-time">
          {(ph / 1000).toFixed(2)} s · {Math.floor(ph / step) + 1}/{count}
        </span>
        <span class="spacer" />
        <span class="muted">{t('editor.duration')}</span>
        <NumberInput value={d} min={20} max={MAX_DURATION} step={10} onChange={setDuration} />
        <span class="muted">{t('editor.interval')}</span>
        <NumberInput value={interval.value} min={20} max={1000} step={10} onChange={setInterval_} width={70} />
        <span class="muted">ms</span>
      </Row>
      <div class="tl">
        <div class="tl-row">
          <div class="tl-name" />
          <Ruler d={d} />
        </div>
        {ls.map((l) => {
          const i = layers.value.indexOf(l);
          return (
            <div key={l.id} class={`tl-row ${selectedId.value === l.id ? 'sel' : ''}`}>
              <div class="tl-name" onClick={() => (selectedId.value = l.id)}>
                <input type="checkbox" title={t('editor.visible')} checked={l.visible} onClick={(e) => e.stopPropagation()} onChange={(e) => updateLayer(l.id, { visible: (e.currentTarget as HTMLInputElement).checked })} />
                <span title={l.name}>{l.name}</span>
                <button title={t('editor.up')} disabled={i === layers.value.length - 1} onClick={(e) => (e.stopPropagation(), moveLayer(l.id, 1))}>▲</button>
                <button title={t('editor.down')} disabled={i === 0} onClick={(e) => (e.stopPropagation(), moveLayer(l.id, -1))}>▼</button>
                <button title={t('editor.remove')} onClick={(e) => (e.stopPropagation(), removeLayer(l.id))}>✕</button>
              </div>
              <div class="tl-track" onPointerDown={() => (selectedId.value = l.id)}>
                <TrackBar l={l} d={d} />
                <i class="tl-head" style={{ left: `${(ph / d) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p class="hint">
        {t('editor.outputInfo', { count, step, total: count * step })}
        {step > interval.value && t('editor.stepRaised', { step })}
      </p>
      <p class="hint">{t('editor.timelineHint')}</p>
    </Card>
  );
}

// ---------------------------------------------------------------- properties
function Properties() {
  const l = selectedLayer.value;
  if (!l) return <Card title={t('editor.layer')}><p class="hint">{t('editor.noSelection')}</p></Card>;
  const { w, h } = size(l);
  const animated = l.frames.length > 1;
  const set = (patch: Partial<EditorLayer>) => updateLayer(l.id, patch);
  const fill = coverScale({ width: w, height: h });
  const pct = Math.round((l.scale / fill) * 100);
  return (
    <Card
      title={t('editor.layer')}
      sub={animated ? t('editor.layerInfo', { w, h, frames: l.frames.length, ms: loopMs(l.frames) }) : t('editor.layerInfoStill', { w, h })}
    >
      <Row label={t('editor.position')}>
        X <NumberInput value={l.x} step={1} onChange={(x) => set({ x })} width={70} />
        Y <NumberInput value={l.y} step={1} onChange={(y) => set({ y })} width={70} />
        <button onClick={() => fitLayer(l.id, 'fill')}>{t('editor.fill')}</button>
        <button onClick={() => fitLayer(l.id, 'fit')}>{t('editor.fit')}</button>
        <button onClick={() => fitLayer(l.id, 'center')}>{t('editor.center')}</button>
      </Row>
      <Row label={t('editor.scale')}>
        <input type="range" min={5} max={400} step={1} value={pct} onInput={(e) => set({ scale: (fill * +(e.currentTarget as HTMLInputElement).value) / 100 })} />
        <NumberInput value={pct} min={1} max={2000} onChange={(v) => set({ scale: (fill * Math.max(1, v)) / 100 })} width={70} />
        <span class="muted">%</span>
      </Row>
      <Row label={t('editor.rotation')}>
        <input type="range" min={-180} max={180} step={1} value={l.rotation} onInput={(e) => set({ rotation: +(e.currentTarget as HTMLInputElement).value })} />
        <NumberInput value={l.rotation} min={-180} max={180} step={1} onChange={(v) => set({ rotation: norm180(v) })} width={70} />
        <span class="muted">°</span>
        <button onClick={() => set({ rotation: 0 })}>{t('editor.resetRot')}</button>
      </Row>
      <Row label={t('editor.flip')}>
        <button class={l.flipX ? 'sel-btn' : ''} onClick={() => set({ flipX: !l.flipX })}>⇋ {t('editor.flipH')}</button>
        <button class={l.flipY ? 'sel-btn' : ''} onClick={() => set({ flipY: !l.flipY })}>⇵ {t('editor.flipV')}</button>
      </Row>
      <Row label={t('editor.opacity')}>
        <input type="range" min={0} max={100} step={1} value={Math.round(l.opacity * 100)} onInput={(e) => set({ opacity: +(e.currentTarget as HTMLInputElement).value / 100 })} />
        <span class="val">{Math.round(l.opacity * 100)}%</span>
      </Row>
      <Row label={t('image.gamma')}>
        <input type="range" min={0.3} max={3} step={0.05} value={l.gamma} onInput={(e) => set({ gamma: +(e.currentTarget as HTMLInputElement).value })} />
        <span class="val">{l.gamma.toFixed(2)}</span>
        <label>
          <input type="checkbox" checked={l.invert} onChange={(e) => set({ invert: (e.currentTarget as HTMLInputElement).checked })} /> {t('image.invert')}
        </label>
      </Row>
      <div class="group-title">{t('editor.timing')}</div>
      <Row label={t('editor.start')}>
        <NumberInput value={l.start} min={0} step={10} onChange={(v) => set({ start: Math.max(0, v) })} />
        <span class="muted">{t('editor.layerLength')}</span>
        <NumberInput value={l.length} min={10} step={10} onChange={(v) => set({ length: Math.max(10, v) })} />
        <span class="muted">ms</span>
      </Row>
      {animated && (
        <Row label={t('editor.speed')}>
          <input type="range" min={0.25} max={4} step={0.05} value={l.speed} onInput={(e) => set({ speed: +(e.currentTarget as HTMLInputElement).value })} />
          <span class="val">{l.speed.toFixed(2)}×</span>
          <span class="muted">{t('editor.trimIn')}</span>
          <NumberInput value={Math.round(l.trimIn)} min={0} step={10} onChange={(v) => set({ trimIn: Math.max(0, v) })} />
          <span class="muted">ms</span>
        </Row>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- page
export function EditorPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  useEffect(() => void ensureEditorLoaded(), []);
  usePlayback();
  useEffect(() => () => void (playing.value = false), []);
  const empty = !layers.value.length;
  const pick = () => fileInput.current?.click();

  return (
    <div class="page editor">
      <h2>{t('editor.title')}</h2>
      <p class="sub">{t('editor.sub')}</p>
      <Card
        title={t('editor.canvas')}
        actions={
          <>
            <button onClick={pick}>{t('editor.add')}</button>
            <ConfirmButton disabled={empty} onConfirm={clearEditor}>
              {t('editor.clear')}
            </ConfirmButton>
          </>
        }
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const el = e.currentTarget as HTMLInputElement;
            if (el.files) void addEditorFiles(Array.from(el.files)).then(() => (el.value = ''));
          }}
        />
        <Stage onPick={pick} />
        <p class="hint">{editorError.value || t('editor.stageHint')}</p>
        <Row>
          <button class="primary" disabled={empty || !device.value || !!progress} onClick={async () => {
            playing.value = false;
            setProgress([0, 1]);
            await uploadEditor((i, n) => setProgress([i, n]));
            setProgress(null);
          }}>
            {t('editor.upload', { n: selectedProfile.value + 1 })}
          </button>
          <button disabled={empty} onClick={() => void saveEditorToLibrary()}>{t('editor.saveLib')}</button>
          <button disabled={empty} onClick={downloadGif}>{t('editor.download')}</button>
          {progress && <progress value={progress[0]} max={progress[1]} style="flex:1" />}
        </Row>
      </Card>
      <Timeline />
      <Properties />
    </div>
  );
}
