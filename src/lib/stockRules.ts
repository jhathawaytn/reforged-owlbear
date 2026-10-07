// Pure rules for changing a character's Usage stocks from outside their own
// sheet: drawing food/water from another traveler's stock (V-010) and adding
// what Forage / Hunt / Fish turned up (V-005). The broadcast plumbing lives in
// services/StockOperations.ts; this file only computes the new character.

import { COMPENDIUM, withCompendiumItem } from "./compendium";
import { isOverburdened } from "./model/ReforgedCharacter";
import type { DieSize, GearItem, ReforgedCharacter, UsageDieState } from "./types";
import { DIE_SIDES, stepDownDie } from "./types";

export type StockCategory = "Food" | "Water";

// One food/water stock as other travelers see it ("Mara - Waterskin d4").
export type SharableStock = {
  gearId: string;
  name: string;
  category: StockCategory;
  die: DieSize;
};

function categoryOf(item: GearItem): StockCategory | undefined {
  if (item.usageKind === "Rations") return "Food";
  if (item.usageKind === "Water") return "Water";
  return undefined;
}

export function sharableStocks(pc: ReforgedCharacter): SharableStock[] {
  return pc.gear.flatMap((item) => {
    const category = categoryOf(item);
    if (!category || !item.usageDie || item.usageDie === "depleted") return [];
    return [{ gearId: item.id, name: item.name, category, die: item.usageDie }];
  });
}

export type StockRollResult =
  | { ok: true; pc: ReforgedCharacter; itemName: string; before: DieSize; roll: number; after: UsageDieState }
  | { ok: false; reason: string };

// Roll a specific stock's Usage Die (§9.1.6): on 1..threshold it steps down.
// A die that depletes on this roll still supplied the use.
export function rollSpecificStock(
  pc: ReforgedCharacter,
  gearId: string,
  category: StockCategory,
  threshold: number,
  roll: number,
): StockRollResult {
  const item = pc.gear.find((g) => g.id === gearId);
  if (!item) return { ok: false, reason: "That stock is no longer in their gear." };
  if (categoryOf(item) !== category) return { ok: false, reason: `${item.name} isn't a ${category} stock.` };
  if (!item.usageDie || item.usageDie === "depleted") return { ok: false, reason: `${item.name} is already empty.` };
  const before = item.usageDie;
  const after = roll <= threshold ? stepDownDie(before) : before;
  return {
    ok: true,
    pc: { ...pc, gear: pc.gear.map((g) => (g.id === gearId ? { ...g, usageDie: after } : g)) },
    itemName: item.name,
    before,
    roll,
    after,
  };
}

export function sidesOf(die: DieSize): number {
  return DIE_SIDES[die];
}

export type StockGrantResult = { pc: ReforgedCharacter; summary: string; overburdened: boolean };

// Hunt / Fish / Forage for Food: each stock is its own d6 Fresh Ration item.
export function addFreshRations(pc: ReforgedCharacter, count: number): StockGrantResult {
  const entry = COMPENDIUM.find((i) => i.name === "Fresh Rations");
  if (!entry) throw new Error("Fresh Rations missing from the compendium");
  let next = pc;
  for (let i = 0; i < count; i++) next = withCompendiumItem(next, entry);
  return {
    pc: next,
    summary: `Added ${count} x d6 Fresh Ration${count === 1 ? "" : "s"}.`,
    overburdened: isOverburdened(next),
  };
}

// A usable water source: every Water container goes back to its full die,
// including empty ones (the empty container is still carried).
export function refillWater(pc: ReforgedCharacter): StockGrantResult {
  const refilled: string[] = [];
  const gear = pc.gear.map((g) => {
    if (g.usageKind !== "Water" || !g.usageDieMax || g.usageDie === g.usageDieMax) return g;
    refilled.push(`${g.name} ${g.usageDie ?? "empty"} -> ${g.usageDieMax}`);
    return { ...g, usageDie: g.usageDieMax };
  });
  const next = { ...pc, gear };
  const hasWater = pc.gear.some((g) => g.usageKind === "Water");
  return {
    pc: next,
    summary: refilled.length
      ? `Refilled ${refilled.join(", ")}.`
      : hasWater
        ? "Water already full."
        : "No Water container to refill.",
    overburdened: isOverburdened(next),
  };
}
