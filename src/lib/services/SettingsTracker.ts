import { writable } from "svelte/store";

export type SheetSettings = {
  popoverDuration: number; // seconds
};

const STORAGE_KEY = "reforged-sheet-settings";

function loadSettings(): SheetSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { popoverDuration: 5, ...JSON.parse(raw) };
  } catch {
    // fall through to defaults
  }
  return { popoverDuration: 5 };
}

export const Settings = writable<SheetSettings>(loadSettings());

export function initSettings() {
  Settings.subscribe((s) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  });
}
