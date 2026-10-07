import { describe, expect, it, vi } from "vitest";

// compendium.ts pulls in the Owlbear SDK, which reads `window` at import time.
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {} }));

// Dice are scripted per test: each call takes the next value.
const dice: number[] = [];
vi.mock("./services/DicePlus", () => ({
  rollSingleDie: vi.fn(async () => dice.shift() ?? 1),
  rollDiceValues: vi.fn(async (count: number) => dice.splice(0, count)),
  rollReforgedSave: vi.fn(),
}));

import { addFreshRations, refillWater, rollSpecificStock, sharableStocks } from "./stockRules";
import { resolveExpeditionOutcome } from "./services/ExpeditionRolls";
import { COMPENDIUM, compendiumItemToGear } from "./compendium";
import { defaultPC } from "./model/ReforgedCharacter";
import type { GearItem, ReforgedCharacter } from "./types";
import type { SaveRollResult } from "./utils";

function gear(name: string, id = name): GearItem {
  const entry = COMPENDIUM.find((i) => i.name === name);
  if (!entry) throw new Error(`Missing compendium item: ${name}`);
  return compendiumItemToGear(entry, id);
}

function pcWith(items: GearItem[], str = 10): ReforgedCharacter {
  const pc = defaultPC();
  pc.gear = items;
  pc.attacks = [];
  pc.attributes = { ...pc.attributes, STR: str };
  return pc;
}

const success = (natural = 10): SaveRollResult => ({ natural, firstRoll: natural, modifier: 0, total: natural, success: true });
const failure: SaveRollResult = { natural: 15, firstRoll: 15, modifier: 0, total: 15, success: false };

describe("sharableStocks", () => {
  it("lists live food and water only, with their die", () => {
    const empty = { ...gear("Waterskin", "empty"), usageDie: "depleted" as const };
    const pc = pcWith([gear("Waterskin", "w"), gear("Trail Rations", "r"), gear("Torch Bundle", "t"), empty]);
    expect(sharableStocks(pc)).toEqual([
      { gearId: "w", name: "Waterskin", category: "Water", die: "d6" },
      { gearId: "r", name: "Trail Rations", category: "Food", die: "d6" },
    ]);
  });
});

describe("rollSpecificStock (V-010 donor roll)", () => {
  it("steps the donor's exact stock down on a low roll", () => {
    const pc = pcWith([gear("Waterskin", "a"), gear("Waterskin", "b")]);
    const result = rollSpecificStock(pc, "b", "Water", 3, 2);
    expect(result).toMatchObject({ ok: true, before: "d6", after: "d4" });
    if (!result.ok) return;
    expect(result.pc.gear.map((g) => g.usageDie)).toEqual(["d6", "d4"]);
  });
  it("holds on a high roll", () => {
    const pc = pcWith([gear("Waterskin", "a")]);
    expect(rollSpecificStock(pc, "a", "Water", 3, 4)).toMatchObject({ ok: true, after: "d6" });
  });
  it("two recipients in a row: the second sees the first one's result, and a d4 depletes", () => {
    let pc = pcWith([{ ...gear("Waterskin", "a"), usageDie: "d4" }]);
    const first = rollSpecificStock(pc, "a", "Water", 3, 1);
    expect(first).toMatchObject({ ok: true, after: "depleted" });
    if (!first.ok) return;
    pc = first.pc;
    expect(rollSpecificStock(pc, "a", "Water", 3, 4)).toEqual({ ok: false, reason: "Waterskin is already empty." });
  });
  it("refuses a missing stock or the wrong kind", () => {
    const pc = pcWith([gear("Trail Rations", "r")]);
    expect(rollSpecificStock(pc, "gone", "Food", 3, 1).ok).toBe(false);
    expect(rollSpecificStock(pc, "r", "Water", 3, 1).ok).toBe(false);
  });
});

describe("addFreshRations / refillWater (V-005)", () => {
  it("adds separate d6 Fresh Ration items", () => {
    const result = addFreshRations(pcWith([]), 2);
    expect(result.pc.gear.map((g) => [g.name, g.usageDie, g.slots])).toEqual([
      ["Fresh Rations", "d6", 1],
      ["Fresh Rations", "d6", 1],
    ]);
    expect(result.summary).toBe("Added 2 x d6 Fresh Rations.");
  });
  it("warns but still adds when it Overburdens", () => {
    const result = addFreshRations(pcWith([], 1), 2);
    expect(result.pc.gear).toHaveLength(2);
    expect(result.overburdened).toBe(true);
  });
  it("refills every Water container, empty ones included, to its full die", () => {
    const pc = pcWith([
      { ...gear("Waterskin", "a"), usageDie: "d4" },
      { ...gear("Waterskin", "b"), usageDie: "depleted" },
      gear("Trail Rations", "r"),
    ]);
    const result = refillWater(pc);
    expect(result.pc.gear.map((g) => g.usageDie)).toEqual(["d6", "d6", "d6"]);
    expect(result.summary).toBe("Refilled Waterskin d4 -> d6, Waterskin depleted -> d6.");
  });
  it("says so when there's nothing to refill", () => {
    expect(refillWater(pcWith([gear("Waterskin")])).summary).toBe("Water already full.");
    expect(refillWater(pcWith([])).summary).toBe("No Water container to refill.");
  });
});

describe("expedition results carry what was found", () => {
  it("Forage for Food / Water", async () => {
    expect((await resolveExpeditionOutcome("Forage for Food", success())).resource).toEqual({ kind: "FreshRations", count: 1 });
    expect((await resolveExpeditionOutcome("Forage for Water", success())).resource).toEqual({ kind: "Water" });
    expect((await resolveExpeditionOutcome("Forage for Food", failure)).resource).toBeUndefined();
  });
  it("Hunt: prey d6 1-3 / 4-5 / 6 = 1 / 2 / 4 stocks", async () => {
    for (const [prey, count] of [[3, 1], [5, 2], [6, 4]]) {
      dice.push(prey);
      expect((await resolveExpeditionOutcome("Hunt", success())).resource).toEqual({ kind: "FreshRations", count });
    }
  });
  it("Fish: catch d6 6 = 3 stocks", async () => {
    dice.push(6);
    expect((await resolveExpeditionOutcome("Fish", success())).resource).toEqual({ kind: "FreshRations", count: 3 });
  });
  it("Trailblaze Boons 21 / 22 / 64 give water / food / GM's pick; a Bane gives nothing", async () => {
    // Natural 1 on Trailblaze = Boon (20 = Bane), then 2d6 picks the entry.
    dice.push(2, 1);
    expect((await resolveExpeditionOutcome("Trailblaze", success(1))).resource).toEqual({ kind: "Water" });
    dice.push(2, 2);
    expect((await resolveExpeditionOutcome("Trailblaze", success(1))).resource).toEqual({ kind: "FreshRations", count: 1 });
    dice.push(6, 4);
    expect((await resolveExpeditionOutcome("Trailblaze", success(1))).resource).toEqual({ kind: "FoodOrWater" });
    dice.push(2, 1);
    const bane = await resolveExpeditionOutcome("Trailblaze", { ...failure, natural: 20, firstRoll: 20, total: 20 });
    expect(bane.resource).toBeUndefined();
  });
});
