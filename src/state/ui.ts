/** Navigation state of the app (not persisted). */
import { signal } from '@preact/signals';

export type Page = 'profile' | 'sync' | 'power' | 'device';
export type ProfileTab = 'lighting' | 'oled' | 'keys';

export const page = signal<Page>('profile');
export const profileTab = signal<ProfileTab>('lighting');
/** key selected in the remap view (key code) */
export const selectedKey = signal<number | null>(null);
