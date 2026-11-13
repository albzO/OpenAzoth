import { describe, expect, it } from 'vitest';
import {
  CMD_BOOSTER_INFO, CMD_BOOSTER_STATE, CMD_POLLING_RATE, POLLING, parseBoosterConnected, parseBoosterInfo, parsePollingRate, pollingRateCmd,
} from '../src/devices/azoth/performance';
import { CONNECTION_KIND, PID, isReceiver, isWired, modelOf } from '../src/hid/discovery';

// Byte layouts follow ASUS Gear Link's Azoth X page (not yet captured from hardware).
const reply = (head: number[], body: number[] = []) => {
  const r = new Uint8Array(64);
  r.set(head);
  r.set(body, 4);
  return r;
};

describe('polling rate / booster packets', () => {
  it('builds the commands the vendor page sends', () => {
    expect(CMD_POLLING_RATE).toEqual([0x12, 0x15]);
    expect(CMD_BOOSTER_STATE).toEqual([0x7d, 0x20, 0x02, 0x00]);
    expect(CMD_BOOSTER_INFO).toEqual([0x7d, 0x20, 0x01, 0x00]);
    expect(pollingRateCmd(POLLING.HZ8000)).toEqual([0x51, 0x31, 0x00, 0x00, 0x03]);
    expect(pollingRateCmd(POLLING.HZ1000)).toEqual([0x51, 0x31, 0x00, 0x00, 0x00]);
  });

  it('parses replies', () => {
    expect(parsePollingRate(reply([0x12, 0x15], [3]))).toBe(POLLING.HZ8000);
    expect(parsePollingRate(reply([0x12, 0x15], [9]))).toBeNull();
    expect(parseBoosterConnected(reply([0x7d, 0x20, 0x02], [1]))).toBe(true);
    expect(parseBoosterConnected(reply([0x7d, 0x20, 0x02], [0]))).toBe(false);
    // firmware 1.02.03, VID 0b05, PID 1234
    expect(parseBoosterInfo(reply([0x7d, 0x20, 0x01], [0x03, 0x02, 0x01, 0x00, 0x05, 0x0b, 0x34, 0x12]))).toEqual({
      firmware: '1.02.03',
      vid: 0x0b05,
      pid: 0x1234,
    });
  });
});

describe('device discovery', () => {
  const dev = (productId: number) => ({ productId }) as HIDDevice;
  it('knows the Azoth X', () => {
    expect(modelOf(dev(PID.AZOTH_X_WIRED))).toBe('azothX');
    expect(modelOf(dev(PID.AZOTH_X_RECEIVER))).toBe('azothX');
    expect(modelOf(dev(PID.AZOTH_WIRED))).toBe('azoth');
    expect(modelOf(dev(PID.OMNI_RECEIVER))).toBe('azoth');
    expect(CONNECTION_KIND[0x1c24]).toBe('wired');
    expect(isWired(dev(PID.AZOTH_X_WIRED))).toBe(true);
    expect(isReceiver(dev(PID.AZOTH_X_RECEIVER))).toBe(true);
    expect(isReceiver(dev(PID.AZOTH_WIRED))).toBe(false);
  });
});
