/** Display names for protocol values (ids → current language). */
import { t, type MessageKey } from './index';
import { describeCode, type OledContent } from '../devices/azoth';
import type { ConnectionKind } from '../hid/discovery';

export const effectName = (id: number): string =>
  id === 0xf1 ? t('effect.software') : id >= 0 && id <= 9 ? t(`effect.${id}` as MessageKey) : t('effect.unknown', { n: id });

export const connectionName = (k: ConnectionKind): string => t(`conn.${k}` as MessageKey);

export const sleepName = (code: number): string => t(`sleep.${code}` as MessageKey);

export function keyLabel(code: number): string {
  const d = describeCode(code);
  switch (d.kind) {
    case 'key': return d.name;
    case 'media': return t(`media.${d.id}` as MessageKey);
    case 'mouse': return t(`mouse.${d.id}` as MessageKey);
    default: return '0x' + d.code.toString(16);
  }
}

export function oledContentName(c: OledContent): string {
  switch (c.kind) {
    case 'preset': return t('oled.content.preset', { n: c.index + 1 });
    case 'unknown': return t('oled.content.unknown', { n: c.code });
    default: return t(`oled.content.${c.kind}` as MessageKey);
  }
}
