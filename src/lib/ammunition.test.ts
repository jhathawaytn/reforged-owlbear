import { describe, expect, it, vi } from "vitest";

// compendium.ts pulls in the Owlbear SDK, which reads `window` at import time.
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {} }));

import {
  ammoStockForWeapon,
  ammunitionAfterRoll,
  checkAmmunition,
  recordAmmunitionUse,
  stocksToRollAfterCombat,
} from "./ammunition";
import { defaultPC, startCombat, endCombat } from "./model/ReforgedCharacter";
import { COMPENDIUM, compendiumItemToGear } from "./compendium";
import { CAREERS } from "./careers";
import type { Attack, GearItem, ReforgedCharacter } from "./types";

function gear(name: string, id = name): GearItem {
  const entry = COMPENDIUM.find((i) => i.name === name);
  if (!entry) throw new Error(`Missing compendium item: ${name}`);
  return compendiumItemToGear(entry, id);
}

function scout(): { pc: ReforgedCharacter; bow: Attack } {
  const pc = defaultPC();
  const bowGear: GearItem = { ...gear("Hunting Bow", "bow") };
  pc.gear = [bowGear, gear("Arrow Quiver", "quiver")];
  const bow: Attack = { id: "a1", name: "Hunting Bow", roll: "d8", notes: "", gearId: "bow" };
  pc.attacks = [bow];
  return { pc, bow };
}

describe("Which stock a weapon needs (§9.4.8)", () => {
  it("matches bows, crossbows, and slings", () => {
    expect(ammoStockForWeapon("Hunting Bow")).toBe("Arrow Quiver");
    expect(ammoStockForWeapon("Shortbow")).toBe("Arrow Quiver");
    expect(ammoStockForWeapon("Longbow")).toBe("Arrow Quiver");
    expect(ammoStockForWeapon("Crossbow")).toBe("Bolt Case");
    expect(ammoStockForWeapon("Hand Crossbow")).toBe("Bolt Case");
    expect(ammoStockForWeapon("Sling")).toBe("Sling Stone Pouch");
  });

  it("never blocks melee or individually tracked thrown weapons", () => {
    expect(ammoStockForWeapon("Dagger")).toBeNull();
    expect(ammoStockForWeapon("Handaxe")).toBeNull();
    expect(ammoStockForWeapon("Heavy Work Hammer")).toBeNull();
    expect(ammoStockForWeapon("Bowie Knife")).toBeNull();
  });
});

describe("Starting Scout (rules v0.5)", () => {
  it("lists an Arrow Quiver as starting ammunition, and the compendium has it at d10 / 1 slot", () => {
    expect(CAREERS.Scout.startingAmmunition).toBe("Arrow Quiver");
    const quiver = gear("Arrow Quiver");
    expect(quiver.usageKind).toBe("Ammunition");
    expect(quiver.usageDie).toBe("d10");
    expect(quiver.slots).toBe(1);
  });

  it("can fire with the starting quiver", () => {
    const { pc, bow } = scout();
    const check = checkAmmunition(pc, bow);
    expect(check.ok && check.stock?.id).toBe("quiver");
  });
});

describe("Firing without usable ammunition", () => {
  it("blocks when there is no quiver", () => {
    const { pc, bow } = scout();
    pc.gear = pc.gear.filter((g) => g.id !== "quiver");
    const check = checkAmmunition(pc, bow);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.message).toContain("No Arrow Quiver available");
  });

  it("blocks when the only quiver is depleted", () => {
    const { pc, bow } = scout();
    pc.gear.find((g) => g.id === "quiver")!.usageDie = "depleted";
    const check = checkAmmunition(pc, bow);
    expect(!check.ok && check.message).toContain("depleted");
  });

  it("does not accept the wrong ammunition type", () => {
    const { pc, bow } = scout();
    pc.gear = [pc.gear[0], gear("Bolt Case", "bolts")];
    expect(checkAmmunition(pc, bow).ok).toBe(false);
  });

  it("uses an unlinked attack's own name when there is no gear link", () => {
    const pc = defaultPC();
    expect(checkAmmunition(pc, { id: "x", name: "Shortbow", roll: "d6", notes: "" }).ok).toBe(false);
    expect(checkAmmunition(pc, { id: "y", name: "Dagger", roll: "d6", notes: "" }).ok).toBe(true);
  });
});

describe("Multiple quivers", () => {
  it("skips a depleted quiver and keeps drawing from the one already used this combat", () => {
    const { pc, bow } = scout();
    pc.gear.find((g) => g.id === "quiver")!.usageDie = "depleted";
    pc.gear.push(gear("Arrow Quiver", "q2"), gear("Arrow Quiver", "q3"));
    startCombat(pc);
    recordAmmunitionUse(pc, pc.gear.find((g) => g.id === "q3")!);
    const check = checkAmmunition(pc, bow);
    expect(check.ok && check.stock?.id).toBe("q3");
  });
});

describe("After-combat Usage roll (one per used stock)", () => {
  it("records a stock once per combat, and only during combat", () => {
    const { pc } = scout();
    const quiver = pc.gear.find((g) => g.id === "quiver")!;
    recordAmmunitionUse(pc, quiver);
    expect(pc.ammoUsedThisCombat).toEqual([]);
    startCombat(pc);
    recordAmmunitionUse(pc, quiver);
    recordAmmunitionUse(pc, quiver);
    expect(pc.ammoUsedThisCombat).toEqual(["quiver"]);
    expect(stocksToRollAfterCombat(pc).map((g) => g.id)).toEqual(["quiver"]);
  });

  it("steps down on 1–3 and holds on 4+", () => {
    expect(ammunitionAfterRoll("d10", 3)).toBe("d8");
    expect(ammunitionAfterRoll("d10", 4)).toBe("d10");
    expect(ammunitionAfterRoll("d4", 1)).toBe("depleted");
  });

  it("clears the tracker at End Combat and Start Combat", () => {
    const { pc } = scout();
    startCombat(pc);
    recordAmmunitionUse(pc, pc.gear.find((g) => g.id === "quiver")!);
    endCombat(pc);
    expect(pc.ammoUsedThisCombat).toEqual([]);
    pc.ammoUsedThisCombat = ["stale"];
    startCombat(pc);
    expect(pc.ammoUsedThisCombat).toEqual([]);
  });
});
