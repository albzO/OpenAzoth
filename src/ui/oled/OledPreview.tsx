/**
 * 208×64 canvas that plays a "scene": a draw function, optionally animated with per-frame delays.
 * With `interact`, the canvas can be dragged (move) and scrolled (zoom); deltas are in screen pixels.
 */
import { useEffect, useRef } from 'preact/hooks';
import { lang } from '../../i18n';
import { OLED_W } from '../../devices/azoth/oled';

export interface Scene {
  /** identity: the scene restarts when this changes */
  key: string;
  frames: number;
  /** per-frame delay in ms (animated scenes); ignored for 1 frame */
  delays?: number[];
  /** redraw a static scene this often (e.g. the clock) */
  refreshMs?: number;
  draw: (ctx: CanvasRenderingContext2D, frame: number) => void;
}

export interface PreviewInteraction {
  /** move by (dx, dy) OLED pixels */
  onDrag: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  /** zoom by a factor (> 1 = bigger) */
  onZoom: (factor: number) => void;
}

export function OledPreview({ scene, interact }: { scene: Scene; interact?: PreviewInteraction }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const interactRef = useRef(interact);
  interactRef.current = interact;

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const s = sceneRef.current;
      s.draw(ctx, frame);
      if (s.frames > 1) {
        const d = s.delays?.[frame] ?? 60;
        frame = (frame + 1) % s.frames;
        timer = setTimeout(step, d);
      } else if (s.refreshMs) timer = setTimeout(step, s.refreshMs);
    };
    step();
    return () => clearTimeout(timer);
    // canvas text (placeholders) is drawn in the current language, so redraw when it changes
  }, [scene.key, lang.value]);

  // drag to move, wheel to zoom (only when an interaction is supplied)
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let last: { x: number; y: number } | null = null;
    const toOled = () => OLED_W / el.clientWidth; // CSS px → OLED px
    const down = (e: PointerEvent) => {
      if (!interactRef.current) return;
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    };
    const move = (e: PointerEvent) => {
      if (!last || !interactRef.current) return;
      const k = toOled();
      interactRef.current.onDrag((e.clientX - last.x) * k, (e.clientY - last.y) * k);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      if (!last) return;
      last = null;
      el.classList.remove('dragging');
      interactRef.current?.onDragEnd();
    };
    const wheel = (e: WheelEvent) => {
      if (!interactRef.current) return;
      e.preventDefault();
      interactRef.current.onZoom(Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  return <canvas ref={canvas} class={`oled ${interact ? 'movable' : ''}`} width={208} height={64} />;
}
