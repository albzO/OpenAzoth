/** Animated keyboard preview. Restarts on every settings change; reacts to real key presses. */
import { useEffect, useRef } from 'preact/hooks';
import { current } from '../../state/profiles';
import { lightingRevision } from '../../state/actions';
import { KEY_RECTS, drawKeyboardFrame, effectPeriodMs, type Press } from './previewRenderer';

const CODE_TO_KEY: Record<string, string> = {
  Escape: 'Esc', Backquote: '`', Minus: '-', Equal: '=', Backspace: 'Backspace', Tab: 'Tab', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', CapsLock: 'Caps', Semicolon: ';', Quote: "'", Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'R Shift',
  Comma: ',', Period: '.', Slash: '/', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', MetaLeft: 'Win', AltLeft: 'Alt',
  AltRight: 'R Alt', Space: 'Space', Insert: 'Ins', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};
const keyIndex = new Map(KEY_RECTS.map((k, i) => [k.name, i]));
function keyFromCode(code: string): number | undefined {
  const name = CODE_TO_KEY[code] ?? (/^Key[A-Z]$/.test(code) ? code[3] : /^Digit\d$/.test(code) ? code[5] : /^F\d{1,2}$/.test(code) ? code : undefined);
  return name ? keyIndex.get(name) : undefined;
}

export function KeyboardPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef({ epoch: performance.now(), presses: [] as Press[], lastReal: 0, demoAt: 0 });

  // restart when the user changes anything (the keyboard restarts the effect too)
  const rev = lightingRevision.value;
  useEffect(() => {
    anim.current.epoch = performance.now();
    anim.current.presses = [];
  }, [rev]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select')) return;
      const key = keyFromCode(e.code);
      if (key !== undefined) {
        anim.current.presses.push({ key, at: performance.now() });
        anim.current.lastReal = performance.now();
      }
    };
    document.addEventListener('keydown', onKey);
    let raf = 0;
    const frame = (now: number) => {
      const ctx = canvas.current?.getContext('2d');
      if (ctx) {
        const a = anim.current;
        const state = current.value.lighting;
        const period = effectPeriodMs(state);
        // 触发 / 涟漪: demo presses while the user isn't typing
        if ((state.effect === 3 || state.effect === 5) && now - a.lastReal > 3000 && now > a.demoAt) {
          a.presses.push({ key: Math.floor(Math.random() * KEY_RECTS.length), at: now });
          a.demoAt = now + 500 + Math.random() * 900;
        }
        a.presses = a.presses.filter((q) => now - q.at < period * 1.6);
        drawKeyboardFrame(ctx, state, now - a.epoch, now, a.presses);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return <canvas ref={canvas} class="kbprev" width={1120} height={330} />;
}
