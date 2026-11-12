/**
 * Minimal i18n: a language signal and t(key, params).
 * Components that call t() during render re-render automatically when the language changes.
 */
import { signal } from '@preact/signals';
import { zh, type MessageKey } from './zh';
import { en } from './en';
import { load, save } from '../util/storage';

export type { MessageKey };
export type Lang = 'zh' | 'en';
const DICTS: Record<Lang, Record<MessageKey, string>> = { zh, en };

function initialLang(): Lang {
  const saved = load<string | null>('lang', null);
  if (saved === 'zh' || saved === 'en') return saved;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh';
  return nav?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export const lang = signal<Lang>(initialLang());

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s: string = DICTS[lang.value][key] ?? zh[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

function applyDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
}

export function setLang(l: Lang): void {
  lang.value = l;
  save('lang', l);
  applyDocument();
}

export const toggleLang = (): void => setLang(lang.value === 'zh' ? 'en' : 'zh');

applyDocument();
