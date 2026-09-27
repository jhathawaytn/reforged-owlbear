import { defaultPC } from "../model/ReforgedCharacter";
import type { ReforgedCharacter } from "../types";

export function importFromJson(txt: string): ReforgedCharacter {
  const raw = JSON.parse(txt);
  // merge onto defaults so an older/partial export doesn't leave fields undefined
  return { ...defaultPC(), ...raw };
}
