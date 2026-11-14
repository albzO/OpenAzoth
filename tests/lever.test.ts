import { describe, expect, it } from 'vitest';
import {
  CMD_LEVER_MODE, CMD_LEVER_STATE, LEVER, LEVER_DEFAULT, leverBindCmd, leverEnableCmd, leverReadCmd, parseLeverMode, parseLeverState,
  parseLeverTarget,
} from '../src/devices/azoth/lever';
import { MOUSE } from '../src/devices/azoth/keys';
import { migrate } from '../src/state/profiles';

// Byte layouts from ASUS Gear Link's Azoth page; 22 01, 71 00, 71 01 verified on an Azoth via the Omni receiver (fw 4.00.18).
describe('lever packets', () => {
  it('builds the commands the vendor page sends', () => {
    expect(CMD_LEVER_MODE).toEqual([0x22, 0x01]);
    expect(CMD_LEVER_STATE).toEqual([0x25, 0x0b]);
    expect(leverEnableCmd(3, false)).toEqual([0x71, 0x00, 0x00, 0x00, 0x03, 0x00]);
    expect(leverReadCmd(LEVER.UP)).toEqual([0x25, 0x0c, 0x00, 0x00, 0x07, 0xa4, 0x00]);
    // press -> mouse middle button (0x01f2)
    expect(leverBindCmd(LEVER.PRESS, MOUSE.middle)).toEqual([0x71, 0x01, 0x00, 0x00, 0x07, 0xa5, 0x00, 0xf2, 0x01]);
  });

  it('parses replies', () => {
    const r = new Uint8Array(64);
    r.set([0x25, 0x0b, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1]);
    expect(parseLeverState(r)).toEqual([true, true, false, true, true, false, false, true]);
    expect(parseLeverMode([0x22, 0x01, 0, 0, 7])).toBe(7);
    expect(parseLeverTarget([0x25, 0x0c, 0, 0, 0xe8, 0x01])).toBe(MOUSE.scrollUp);
  });

  it('defaults to scroll up / middle click / scroll down', () => {
    expect(LEVER_DEFAULT[LEVER.UP]).toBe(MOUSE.scrollUp);
    expect(LEVER_DEFAULT[LEVER.PRESS]).toBe(MOUSE.middle);
    expect(LEVER_DEFAULT[LEVER.DOWN]).toBe(MOUSE.scrollDown);
  });
});

describe('lever settings storage', () => {
  it('fills in an empty record for old saved profiles and keeps recorded ones', () => {
    const [a] = migrate({ version: 1, profiles: [{ keyMap: {} }] });
    expect(a.lever).toEqual({ enabled: {}, map: {} });
    const [b] = migrate({ version: 1, profiles: [{ lever: { enabled: { 3: false }, map: { [LEVER.UP]: 0x1f } } }] });
    expect(b.lever).toEqual({ enabled: { 3: false }, map: { [LEVER.UP]: 0x1f } });
  });
});
