import { writable } from "svelte/store";

export type SheetPage = "sheet" | "equipment" | "expedition";
export const Page = writable<SheetPage>("sheet");
