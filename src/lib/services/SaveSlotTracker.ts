import { writable } from "svelte/store";

export const NUM_SLOTS = 3;

export const CurrentSaveSlot = writable(1);
