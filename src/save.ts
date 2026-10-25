// Persistent progress. Stored locally on the device — the game has no
// accounts and sends nothing anywhere. In the iOS app the save is mirrored
// to native storage, which iOS never purges the way it can WebView storage.

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { HEROES, META } from './data';

export interface SaveData {
  version: 1;
  coins: number;
  gems: number;
  highestArea: number; // highest area unlocked (1-based)
  stars: Record<number, number>; // best 1-3 star rating per cleared area
  bestSurvival: number; // seconds
  heroLevels: Record<string, number>; // 0 = locked
  squad: string[]; // hero ids chosen for the next run, in slot order
  meta: Record<string, number>;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  tutorialDone: boolean;
  lastDaily: string; // yyyy-mm-dd of last daily reward claim
  savedAt: number; // ms timestamp of the last write, to pick the newest copy
}

const KEY = 'idolsquad.save.v1';

function fresh(): SaveData {
  const heroLevels: Record<string, number> = {};
  for (const h of HEROES) heroLevels[h.id] = h.unlockCost === 0 ? 1 : 0;
  const meta: Record<string, number> = {};
  for (const m of META) meta[m.id] = 0;
  return {
    version: 1,
    coins: 0,
    gems: 0,
    highestArea: 1,
    stars: {},
    bestSurvival: 0,
    heroLevels,
    squad: ['riya', 'kai'],
    meta,
    sound: true,
    music: true,
    haptics: true,
    tutorialDone: false,
    lastDaily: '',
    savedAt: 0,
  };
}

function parse(raw: string | null): SaveData {
  const base = fresh();
  try {
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...base,
      ...data,
      heroLevels: { ...base.heroLevels, ...(data.heroLevels || {}) },
      meta: { ...base.meta, ...(data.meta || {}) },
      stars: { ...(data.stars || {}) },
    };
  } catch {
    return base;
  }
}

function readLocal() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const save: SaveData = parse(readLocal());

const native = Capacitor.isNativePlatform();

// Called once at startup in the app: adopt the native copy if it is newer.
export async function restoreNativeBackup() {
  if (!native) return;
  try {
    const { value } = await Preferences.get({ key: KEY });
    const backup = parse(value);
    if (value && backup.savedAt > save.savedAt) Object.assign(save, backup);
  } catch {
    // Keep whatever local storage had.
  }
}

export function persist() {
  save.savedAt = Date.now();
  const json = JSON.stringify(save);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // Storage full or unavailable — progress for this session still works.
  }
  if (native) Preferences.set({ key: KEY, value: json }).catch(() => {});
}

export function resetSave() {
  Object.assign(save, fresh());
  persist();
}

export function unlockedHeroes() {
  return HEROES.filter((h) => save.heroLevels[h.id] > 0);
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
