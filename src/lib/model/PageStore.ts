import { writable } from "svelte/store";

export type SheetPage = "sheet" | "equipment";
export const Page = writable<SheetPage>("sheet");
