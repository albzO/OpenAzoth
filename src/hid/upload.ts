/**
 * Chunked upload used by the OLED image (0x61) and banner (0x62) commands:
 *   begin(n)  →  ack
 *   [data0 data1 <remaining u16> <chunk>] × n, remaining counts down to 0, each acked with the same index
 *   [show0 show1 00 00]  →  ack
 * Chunk size = report length − 4 (60 bytes wired, 59 through a receiver).
 */
import type { HidLink } from './transport';
import { t } from '../i18n';

export interface UploadSpec {
  begin: (packets: number) => number[];
  data: readonly [number, number];
  show: readonly [number, number];
}

/** how often one data packet is sent before giving up */
const PACKET_TRIES = 3;

export function packetCount(byteLength: number, reportLength: number): number {
  return Math.ceil(byteLength / (reportLength - 4));
}

export async function chunkedUpload(
  link: HidLink,
  spec: UploadSpec,
  payload: Uint8Array,
  onProgress: (sent: number, total: number) => void = () => {},
): Promise<number> {
  const chunk = link.reportLength - 4;
  const n = packetCount(payload.length, link.reportLength);
  return link.exclusive(async () => {
    if (!(await link.xfer(spec.begin(n), { timeout: 3000 }))) throw new Error(t('err.uploadBegin'));
    link.logSystem(t('log.sending', { n }));
    link.quietRx = true;
    try {
      for (let i = 0; i < n; i++) {
        const rem = n - 1 - i;
        const pkt = [spec.data[0], spec.data[1], rem & 0xff, rem >> 8, ...payload.subarray(i * chunk, (i + 1) * chunk)];
        // an ack can get lost (wireless, or another program talking to the keyboard): resend the same packet
        let ack: Uint8Array | null = null;
        for (let attempt = 0; attempt < PACKET_TRIES && !ack; attempt++) {
          if (attempt) link.logSystem(t('log.retryPacket', { i: i + 1, n, k: attempt + 1 }));
          ack = await link.xfer(pkt, { match: 4, timeout: 1500, quiet: true });
        }
        if (!ack) throw new Error(t('err.uploadPacket', { i: i + 1, n }));
        if ((i & 15) === 0 || i === n - 1) onProgress(i + 1, n);
      }
    } finally {
      link.quietRx = false;
    }
    if (!(await link.xfer([spec.show[0], spec.show[1], 0, 0], { timeout: 3000 }))) throw new Error(t('err.uploadShow'));
    return n;
  });
}
