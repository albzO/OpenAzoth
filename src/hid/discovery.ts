/** Finding and authorising supported devices through WebHID. */
import { findControlCollection } from './transport';

export const ASUS_VID = 0x0b05;

export const PID = {
  AZOTH_WIRED: 0x1a83,
  AZOTH_RECEIVER: 0x1a85,
  OMNI_RECEIVER: 0x1ace,
} as const;

export type ConnectionKind = 'wired' | 'receiver' | 'omni';
export const CONNECTION_KIND: Record<number, ConnectionKind> = {
  [PID.AZOTH_WIRED]: 'wired',
  [PID.AZOTH_RECEIVER]: 'receiver',
  [PID.OMNI_RECEIVER]: 'omni',
};

export const isSupported = (d: HIDDevice): boolean =>
  d.vendorId === ASUS_VID && d.productId in CONNECTION_KIND && !!findControlCollection(d);
export const isWired = (d: HIDDevice): boolean => d.productId === PID.AZOTH_WIRED;
export const isReceiver = (d: HIDDevice): boolean =>
  d.productId === PID.OMNI_RECEIVER || d.productId === PID.AZOTH_RECEIVER;

export const hidAvailable = (): boolean => typeof navigator !== 'undefined' && 'hid' in navigator;

/** Ask the user to pick a device (must run from a click). */
export async function requestDevice(): Promise<HIDDevice | null> {
  const filters = Object.keys(CONNECTION_KIND).map((p) => ({ vendorId: ASUS_VID, productId: +p, usagePage: 0xff00 }));
  const devs = await navigator.hid.requestDevice({ filters });
  return devs.find(isSupported) ?? null;
}

/** Previously authorised devices that are plugged in, wired first. */
export async function grantedDevices(): Promise<HIDDevice[]> {
  if (!hidAvailable()) return [];
  const devs = (await navigator.hid.getDevices()).filter(isSupported);
  return devs.sort((a, b) => Number(isWired(b)) - Number(isWired(a)));
}
