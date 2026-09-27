import { get, writable } from "svelte/store";
import { PlayerCharacterStore } from "../model/ReforgedCharacter";
import { defaultPC } from "../model/ReforgedCharacter";
import { debounce } from "../utils";
import { CurrentSaveSlot } from "./SaveSlotTracker";
import type { ReforgedCharacter } from "../types";

export const isSaveInProgress = writable(false);

const saveToLocalStorage = debounce(
  savePlayerToLocalStorage,
  1500,
  () => isSaveInProgress.set(true),
  () => isSaveInProgress.set(false),
);

export async function clearLocalStorage(numSlots: number) {
  for (let i = 0; i < numSlots; i++) {
    window.localStorage.removeItem(getStorageKey(i + 1));
  }
}

export async function init() {
  CurrentSaveSlot.set(await getSaveSlot());

  CurrentSaveSlot.subscribe(async (slot) => {
    PlayerCharacterStore.set(await loadPlayerFromLocalStorage(slot));
  });

  PlayerCharacterStore.subscribe((pc) =>
    saveToLocalStorage(pc, get(CurrentSaveSlot)),
  );

  CurrentSaveSlot.subscribe(saveSaveSlot);
}

export async function savePlayerToLocalStorage(
  pc: ReforgedCharacter,
  saveSlot: number,
) {
  window.localStorage.setItem(getStorageKey(saveSlot), JSON.stringify(pc));
}

function getStorageKey(saveSlot: number) {
  return `reforged-sheet-slot-${saveSlot}`;
}

export async function getSaveSlot(): Promise<number> {
  return parseInt(window.localStorage.getItem("reforged-sheet-chosen-slot") ?? "1");
}

export async function saveSaveSlot(slot: number) {
  window.localStorage.setItem("reforged-sheet-chosen-slot", `${slot}`);
}

export async function loadPlayerFromLocalStorage(
  saveSlot: number,
): Promise<ReforgedCharacter> {
  const json = window.localStorage.getItem(getStorageKey(saveSlot));
  if (!json) return defaultPC();
  try {
    return { ...defaultPC(), ...(JSON.parse(json) as ReforgedCharacter) };
  } catch {
    return defaultPC();
  }
}
