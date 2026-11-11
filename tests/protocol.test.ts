/**
 * Protocol tests. Expected bytes come from real exchanges with an Azoth (fw 4.00.18,
 * Omni receiver fw 7.00.07) recorded during development, or from the vendor page's own code.
 */
import { describe, expect, it } from 'vitest';
import {
  CMD_RESET_LIGHTING, resetProfilesCmd,
  IMAGE_UPLOAD, bannerUpload, defaultLighting, keyBindCmd, lightingPackets, lowBatteryCmd,
  oledClockCmd, parseDeviceInfo, parsePower, parseSerial, powerSavingCmd, sleepCmd, type LightingState,
} from '../src/devices/azoth';

const bytes = (s: string) => new Uint8Array(s.split(' ').map((h) => parseInt(h, 16)));
const hex = (a: ArrayLike<number>) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(' ');

describe('device info (12 00)', () => {
  it('wired: version A is the keyboard', () => {
    const info = parseDeviceInfo(bytes('12 00 00 00 18 00 04 00 06 02 06 06 01 00 00 00'), false);
    expect(info).toEqual({ keyboardFw: '4.00.18', receiverFw: null, profile: 0, effect: 2 });
  });
  it('receiver: version A is the receiver, B the keyboard', () => {
    const info = parseDeviceInfo(bytes('12 00 00 00 07 00 07 00 06 02 06 18 00 04 00 00'), true);
    expect(info.keyboardFw).toBe('4.00.18');
    expect(info.receiverFw).toBe('7.00.07');
  });
  it('profile 6 means index 0, others are the index', () => {
    expect(parseDeviceInfo(bytes('12 00 00 00 07 00 07 00 06 01 03 18 00 04 00 00'), true).profile).toBe(3);
  });
});

describe('serial number (12 14 02)', () => {
  it('parses the ASCII serial recorded from a real keyboard', () => {
    expect(parseSerial(bytes('12 14 02 00 41 31 32 33 34 35 36 37 38 39 30 31 00 00 00 00'))).toBe('A12345678901');
  });
  it('stops at the first non-printable byte and returns null when empty', () => {
    expect(parseSerial(bytes('12 14 02 00 41 42 00 43 00 00 00 00 00 00 00 00'))).toBe('AB');
    expect(parseSerial(bytes('12 14 02 00 00 00 00 00 00 00 00 00 00 00 00 00'))).toBeNull();
  });
});

describe('power (12 01)', () => {
  it('parses battery, sleep, saving, charging, warning and voltage', () => {
    expect(parsePower(bytes('12 01 00 00 00 64 02 01 01 14 64 fa 10'))).toEqual({
      battery: 100, idle: 2, saving: 1, charging: true, lowBattery: 20, millivolts: 0x10fa,
    });
  });
  it('builds the keyboard power commands (51 37 is the mouse one)', () => {
    expect(hex(lowBatteryCmd(20))).toBe('51 3a 00 00 14');
    expect(hex(powerSavingCmd(1))).toBe('51 39 00 00 01');
    expect(hex(sleepCmd(255))).toBe('51 38 00 00 ff');
  });
});

describe('lighting (51 2C)', () => {
  const withEffect = (id: number, patch: Partial<LightingState['fx'][number]> = {}): LightingState => {
    const s = defaultLighting();
    s.effect = id;
    s.fx[id] = { ...s.fx[id], ...patch };
    return s;
  };

  it('static: one packet, single colour, no speed', () => {
    const [p] = lightingPackets(withEffect(0, { color: '#00b3ff', bright: 100 }));
    expect(hex(p)).toBe('51 2c 00 00 ff 64 00 ff ff 00 b3 ff 00 00 00 00 00 00');
  });
  it('starry night: double colour + background', () => {
    const [p] = lightingPackets(withEffect(6, { colorMode: 'double', double: ['#ff0000', '#0000ff'], bgOn: true, bg: '#101010', speed: 0 }));
    expect(hex(p)).toBe('51 2c 06 00 19 32 10 ff ff ff 00 00 00 00 ff 10 10 10');
  });
  it('breathing random sets the random flag', () => {
    const [p] = lightingPackets(withEffect(1, { colorMode: 'random' }));
    expect(p[6]).toBe(0x01);
  });
  it('rainbow: 3 chunks counting down, 7 stops, direction and width', () => {
    const ps = lightingPackets(withEffect(4, { dir: 8, width: 2 }));
    expect(ps.map((p) => p[3])).toEqual([2, 1, 0]);
    expect(hex(ps[0].slice(4, 14))).toBe('3e 32 00 08 02 07 0c f5 00 ff');
  });
  it('ripple random: stops zeroed, random flag set', () => {
    const ps = lightingPackets(withEffect(5, { random: true }));
    expect(ps[0][6]).toBe(1);
    expect(ps[0].slice(10, 14)).toEqual([0, 0, 0, 0]);
  });
  it('quicksand: 2 chunks, direction up by default, no width', () => {
    const ps = lightingPackets(withEffect(7));
    expect(ps.map((p) => p[3])).toEqual([1, 0]);
    expect(hex(ps[0].slice(4, 12))).toBe('0f 32 00 06 00 fe f6 00');
  });
});

describe('keys and OLED commands', () => {
  it('key binding matches the recorded packet', () => {
    expect(hex(keyBindCmd(0x01, 0x6e))).toBe('51 20 01 00 6e 00');
  });
  it('clock matches the recorded packet (12 h, 20:23 on 2026-11-11)', () => {
    expect(hex(oledClockCmd(new Date(2026, 10, 11, 20, 23), false))).toBe('63 00 00 00 02 ea 07 0b 0b 08 17');
  });
  it('image upload begin carries the packet count as u32', () => {
    expect(hex(IMAGE_UPLOAD.begin(1332))).toBe('61 01 00 00 34 05 00 00');
  });
  it('banner begin matches the recorded packet', () => {
    expect(hex(bannerUpload(2, 1, 208, 46).begin(80))).toBe('62 00 00 00 02 01 d0 00 2e 00 50 00');
  });
});

describe('factory resets (as sent by the vendor page)', () => {
  it('builds the reset packets', () => {
    expect(CMD_RESET_LIGHTING).toEqual([0x50, 0x61, 0, 0]);
    expect(resetProfilesCmd(false)).toEqual([0x50, 0x40, 0, 0, 0]);
    expect(resetProfilesCmd(true)).toEqual([0x50, 0x40, 0, 0, 1]);
  });
});
