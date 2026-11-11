/**
 * WebHID transport for ASUS-style vendor control interfaces (usage page 0xFF00).
 * Device-agnostic: knows about reports, acknowledgements and queuing, nothing about commands.
 */
import { hex } from '../util/bytes';
import { t } from '../i18n';

export type LogKind = 'tx' | 'rx' | 'er' | 'sy';
export type LogFn = (kind: LogKind, text: string) => void;

export interface XferOptions {
  /** how many leading bytes of the request the reply must echo (default 2: cmd + sub) */
  match?: number;
  timeout?: number;
  /** don't write this exchange to the log */
  quiet?: boolean;
  /** accept the keyboard's rejection reply (ff aa) as the answer */
  nakOk?: boolean;
  /** return null instead of throwing when there is no reply */
  optional?: boolean;
}

export class NoReplyError extends Error {}

/** ff aa = the firmware rejected the last command */
export const isRejection = (r: Uint8Array): boolean => r[0] === 0xff && r[1] === 0xaa;

interface Waiter {
  prefix: number[];
  nakOk: boolean;
  resolve: (r: Uint8Array | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ControlCollection {
  reportId: number;
  /** payload length in bytes, excluding the report ID */
  length: number;
}

/** Find the vendor control collection (0xFF00) and its output report size. */
export function findControlCollection(dev: HIDDevice): ControlCollection | null {
  for (const c of dev.collections) {
    if (c.usagePage !== 0xff00 || !c.outputReports?.length) continue;
    const r = c.outputReports[0];
    const bits = (r.items ?? []).reduce((s, it) => s + (it.reportSize ?? 0) * (it.reportCount ?? 0), 0);
    return { reportId: r.reportId ?? 0, length: bits / 8 || 64 };
  }
  return null;
}

export class HidLink {
  /** while true, received reports are not logged (bulk uploads) */
  quietRx = false;
  private waiters: Waiter[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    readonly device: HIDDevice,
    readonly reportId: number,
    readonly reportLength: number,
    private readonly log: LogFn,
  ) {}

  static async open(device: HIDDevice, log: LogFn): Promise<HidLink> {
    const col = findControlCollection(device);
    if (!col) throw new Error(t('err.noControl'));
    if (!device.opened) await device.open();
    const link = new HidLink(device, col.reportId, col.length, log);
    device.addEventListener('inputreport', link.onInput);
    return link;
  }

  async close(): Promise<void> {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.resolve(null);
    }
    this.waiters = [];
    this.device.removeEventListener('inputreport', this.onInput);
    try {
      await this.device.close();
    } catch {
      /* already gone */
    }
  }

  /** called for reports nobody here was waiting for (e.g. another program's replies) */
  onUnsolicited?: (report: Uint8Array) => void;
  /** our own commands that timed out recently, so their late replies aren't mistaken for foreign traffic */
  private timedOut: { prefix: number[]; at: number }[] = [];

  private onInput = (e: HIDInputReportEvent): void => {
    if (e.reportId !== this.reportId) return;
    const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const rejected = isRejection(d);
    const i = this.waiters.findIndex((w) => (rejected ? w.nakOk : w.prefix.every((b, j) => d[j] === b)));
    // during bulk uploads only our own acks are silenced; anything unexpected is still logged
    if (!this.quietRx || i < 0) this.log('rx', hex(d.subarray(0, 20)));
    if (i < 0) {
      // a late reply to one of our own timed-out commands isn't someone else's traffic
      const now = Date.now();
      this.timedOut = this.timedOut.filter((x) => now - x.at < 5000);
      const late = this.timedOut.findIndex((x) => x.prefix.every((b, j) => d[j] === b));
      if (late >= 0) this.timedOut.splice(late, 1);
      else this.onUnsolicited?.(new Uint8Array(d));
      return;
    }
    const [w] = this.waiters.splice(i, 1);
    clearTimeout(w.timer);
    w.resolve(new Uint8Array(d));
  };

  /** Send one report and wait for its echo. Not queued — use cmd() unless you hold exclusive(). */
  async xfer(bytes: ArrayLike<number>, opts: XferOptions = {}): Promise<Uint8Array | null> {
    const { match = 2, timeout = 1200, quiet = false, nakOk = false } = opts;
    const buf = new Uint8Array(this.reportLength);
    buf.set(Array.from(bytes).slice(0, this.reportLength));
    const reply = new Promise<Uint8Array | null>((resolve) => {
      const w: Waiter = {
        prefix: Array.from(bytes).slice(0, match),
        nakOk,
        resolve,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((x) => x !== w);
          this.timedOut.push({ prefix: w.prefix, at: Date.now() });
          resolve(null);
        }, timeout),
      };
      this.waiters.push(w);
    });
    if (!quiet) this.log('tx', hex(bytes));
    await this.device.sendReport(this.reportId, buf);
    return reply;
  }

  /** Queued command; throws NoReplyError unless opts.optional. */
  cmd(bytes: ArrayLike<number>, opts: XferOptions = {}): Promise<Uint8Array | null> {
    return this.exclusive(async () => {
      const r = await this.xfer(bytes, opts);
      if (!r && !opts.optional) {
        this.log('er', t('log.noReply', { bytes: hex(Array.from(bytes).slice(0, 6)) }));
        throw new NoReplyError(t('err.noReply', { cmd: hex(Array.from(bytes).slice(0, 2)) }));
      }
      return r;
    });
  }

  /** Run a sequence with nothing else interleaved (e.g. a chunked upload). */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  logSystem(text: string): void {
    this.log('sy', text);
  }
}
