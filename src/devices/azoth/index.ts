/**
 * The Azoth as seen by the app: one object per open connection, wrapping the protocol
 * functions around a HidLink. UI and state code talk to this, never to raw bytes.
 */
import { isRejection, type HidLink } from '../../hid/transport';
import { chunkedUpload } from '../../hid/upload';
import { isReceiver } from '../../hid/discovery';
import {
  CMD_DEVICE_INFO, CMD_LAYOUT, CMD_OLED_ANIMATION, CMD_POWER, CMD_RESET_LIGHTING, CMD_SAVE, CMD_SERIAL,
  parseDeviceInfo, parseLayout, parseOledAnimation, parsePower, parseSerial, resetProfilesCmd, setProfileCmd,
  type DeviceInfo, type PowerState,
} from './info';
import { lightingPackets, type LightingState } from './lighting';
import { keyBindCmd } from './keys';
import { IMAGE_UPLOAD, bannerUpload, oledBrightnessCmd, oledClockCmd, oledPowerCmd, oledPresetCmd } from './oled';
import { lowBatteryCmd, powerSavingCmd, sleepCmd } from './power';
import {
  CMD_LEVER_MODE, CMD_LEVER_STATE, leverBindCmd, leverEnableCmd, leverReadCmd, parseLeverMode, parseLeverState, parseLeverTarget,
} from './lever';
import {
  CMD_BOOSTER_INFO, CMD_BOOSTER_STATE, CMD_POLLING_RATE, parseBoosterConnected, parseBoosterInfo, parsePollingRate, pollingRateCmd,
  type BoosterInfo,
} from './performance';
import { t, type MessageKey } from '../../i18n';

export class RejectedError extends Error {}

export class Azoth {
  constructor(readonly link: HidLink) {}

  get viaReceiver(): boolean {
    return isReceiver(this.link.device);
  }

  // ---- reads (null when the keyboard doesn't answer, e.g. asleep behind a receiver)
  async readDeviceInfo(): Promise<DeviceInfo | null> {
    const r = await this.link.cmd(CMD_DEVICE_INFO, { optional: true });
    return r ? parseDeviceInfo(r, this.viaReceiver) : null;
  }
  async readPower(quiet = false): Promise<PowerState | null> {
    const r = await this.link.cmd(CMD_POWER, { optional: true, quiet, timeout: 1500 });
    return r && r[0] === 0x12 ? parsePower(r) : null;
  }
  async readLayout(): Promise<number | null> {
    const r = await this.link.cmd(CMD_LAYOUT, { optional: true });
    return r ? parseLayout(r) : null;
  }
  async readOledAnimation(): Promise<number | null> {
    const r = await this.link.cmd(CMD_OLED_ANIMATION, { optional: true });
    return r ? parseOledAnimation(r) : null;
  }
  async readSerial(): Promise<string | null> {
    const r = await this.link.cmd(CMD_SERIAL, { optional: true, timeout: 1500 });
    return r ? parseSerial(r) : null;
  }
  // Azoth X only (experimental): Booster and polling rate
  async readBoosterConnected(quiet = false): Promise<boolean | null> {
    const r = await this.link.cmd(CMD_BOOSTER_STATE, { optional: true, quiet, nakOk: true });
    return r && !isRejection(r) ? parseBoosterConnected(r) : null;
  }
  async readBoosterInfo(): Promise<BoosterInfo | null> {
    const r = await this.link.cmd(CMD_BOOSTER_INFO, { optional: true, nakOk: true });
    return r && !isRejection(r) ? parseBoosterInfo(r) : null;
  }
  // lever (experimental)
  async readLeverMode(): Promise<number | null> {
    const r = await this.link.cmd(CMD_LEVER_MODE, { optional: true, nakOk: true });
    return r && !isRejection(r) ? parseLeverMode(r) : null;
  }
  async readLeverState(): Promise<boolean[] | null> {
    const r = await this.link.cmd(CMD_LEVER_STATE, { optional: true, nakOk: true });
    return r && !isRejection(r) ? parseLeverState(r) : null;
  }
  async readLeverTarget(source: number): Promise<number | null> {
    const r = await this.link.cmd(leverReadCmd(source), { optional: true, nakOk: true });
    return r && !isRejection(r) ? parseLeverTarget(r) : null;
  }
  async readPollingRate(): Promise<number | null> {
    const r = await this.link.cmd(CMD_POLLING_RATE, { optional: true, nakOk: true });
    return r && !isRejection(r) ? parsePollingRate(r) : null;
  }

  // ---- writes
  save = (): Promise<unknown> => this.link.cmd(CMD_SAVE);
  setProfile = (index: number): Promise<unknown> => this.link.cmd(setProfileCmd(index));
  /** factory lighting for the active profile */
  resetLighting = () => this.checked(CMD_RESET_LIGHTING, 'what.reset');
  /** factory settings for the active profile, or all profiles */
  resetProfiles = (all: boolean) => this.checked(resetProfilesCmd(all), 'what.reset');

  async applyLighting(state: LightingState): Promise<void> {
    for (const p of lightingPackets(state)) await this.link.cmd(p);
  }

  bindKey = (source: number, target: number): Promise<unknown> => this.link.cmd(keyBindCmd(source, target));
  /** Debug: map a key to any code and report how the keyboard answered (echo, ff aa, or nothing). */
  async bindKeyRaw(source: number, target: number): Promise<'ok' | 'rejected' | 'noReply'> {
    const r = await this.link.cmd(keyBindCmd(source, target), { optional: true, nakOk: true });
    return !r ? 'noReply' : isRejection(r) ? 'rejected' : 'ok';
  }

  oledPower = (on: boolean): Promise<unknown> => this.link.cmd(oledPowerCmd(on));
  oledBrightness = (pct: number): Promise<unknown> => this.link.cmd(oledBrightnessCmd(pct));
  oledPreset = (index: number): Promise<unknown> => this.link.cmd(oledPresetCmd(index));
  oledClock = (use24h: boolean, quiet = false): Promise<unknown> => this.link.cmd(oledClockCmd(new Date(), use24h), { quiet });

  uploadImage(binary: Uint8Array, onProgress?: (i: number, n: number) => void): Promise<number> {
    return chunkedUpload(this.link, IMAGE_UPLOAD, binary, onProgress);
  }
  uploadBanner(pattern: number, layout: number, w: number, h: number, data: Uint8Array, onProgress?: (i: number, n: number) => void): Promise<number> {
    return chunkedUpload(this.link, bannerUpload(pattern, layout, w, h), data, onProgress);
  }

  setSleep = (code: number) => this.checked(sleepCmd(code), 'what.sleep');
  setPowerSaving = (mode: number) => this.checked(powerSavingCmd(mode), 'what.saving');
  setLowBattery = (pct: number) => this.checked(lowBatteryCmd(pct), 'what.low');
  bindLever = (source: number, target: number) => this.checked(leverBindCmd(source, target), 'what.lever');
  enableLeverMode = (mode: number, on: boolean) => this.checked(leverEnableCmd(mode, on), 'what.lever');
  setPollingRate = (index: number) => this.checked(pollingRateCmd(index), 'what.polling');

  /** write that the firmware may refuse with ff aa */
  private async checked(bytes: number[], what: MessageKey): Promise<void> {
    const r = await this.link.cmd(bytes, { nakOk: true });
    if (r && isRejection(r)) throw new RejectedError(t('err.rejected', { what: t(what) }));
  }
}

export * from './info';
export * from './lighting';
export * from './keys';
export * from './oled';
export * from './power';
export * from './performance';
export * from './lever';
