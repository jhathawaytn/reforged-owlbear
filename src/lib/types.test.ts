import { describe, it, expect, vi, afterEach } from "vitest";
import {
  applyAgeAttrDeltas,
  stepWeaponDie,
  stepWeaponDieUp,
  coinBurdenSlots,
  stepDownDie,
  occupiesSlotWhenDepleted,
  degradeCondition,
  repairCondition,
  hasArmorProperty,
  levelForXP,
  titleForLevel,
  attributeGrows,
  lowestAttributes,
  techniqueCapacityForLevel,
  rollScar,
  rollInjurySite,
} from "./types";
import type { GearItem } from "./types";
import { rollSave } from "./utils";

afterEach(() => {
  vi.restoreAllMocks();
});

function gear(overrides: Partial<GearItem> = {}): GearItem {
  return { id: "g1", name: "Test Item", zone: "Hand", slots: 1, equipped: true, notes: "", ...overrides };
}

describe("rollSave (§2.5-2.7)", () => {
  function mockD20(sequence: number[]) {
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      const roll = sequence[i++];
      return (roll - 1) / 20; // Math.floor(rand*20)+1 === roll for rand in [ (roll-1)/20, roll/20 )
    });
  }

  it("natural 1 always succeeds, even with a huge negative modifier", () => {
    mockD20([1]);
    const r = rollSave(10, -50);
    expect(r.natural).toBe(1);
    expect(r.success).toBe(true);
    expect(r.autoResult).toBe("success");
  });

  it("natural 20 always fails, even with a huge positive modifier", () => {
    mockD20([20]);
    const r = rollSave(10, 50);
    expect(r.natural).toBe(20);
    expect(r.success).toBe(false);
    expect(r.autoResult).toBe("failure");
  });

  it("succeeds when total <= target, fails when it exceeds it", () => {
    mockD20([10]);
    expect(rollSave(10, 0).success).toBe(true);
    mockD20([11]);
    expect(rollSave(10, 0).success).toBe(false);
  });

  it("Advantage keeps the LOWER of two d20s (roll-under, so lower is better)", () => {
    mockD20([15, 6]);
    const r = rollSave(10, 0, "advantage");
    expect(r.natural).toBe(6);
    expect(r.otherRoll).toBe(15);
  });

  it("Disadvantage keeps the HIGHER of two d20s", () => {
    mockD20([15, 6]);
    const r = rollSave(10, 0, "disadvantage");
    expect(r.natural).toBe(15);
    expect(r.otherRoll).toBe(6);
  });
});

describe("Attribute Adjustment floor/ceiling (§3.3, §3.2)", () => {
  it("clamps a positive delta at 18", () => {
    const next = applyAgeAttrDeltas({ STR: 17, DEX: 10, INT: 10, WIL: 10 }, "Prime");
    expect(next.STR).toBe(18); // Prime: STR +1, INT +1
  });

  it("never raises an Attribute that's already at or above 18 further via a positive delta", () => {
    const next = applyAgeAttrDeltas({ STR: 18, DEX: 10, INT: 10, WIL: 10 }, "Prime");
    expect(next.STR).toBe(18);
  });

  it("floors a negative delta at 6", () => {
    const next = applyAgeAttrDeltas({ STR: 10, DEX: 7, INT: 10, WIL: 10 }, "Very Old");
    expect(next.DEX).toBe(6); // Very Old: DEX -1, from 7 -> 6
  });

  it("does not raise an already-below-floor Attribute back up to 6", () => {
    const next = applyAgeAttrDeltas({ STR: 10, DEX: 5, INT: 10, WIL: 10 }, "Very Old");
    expect(next.DEX).toBe(5); // already below 6, penalty ignored per the book's worked example
  });
});

describe("Weapon Condition die stepping (§9.4.2)", () => {
  it("steps a weapon die down one size for Damaged", () => {
    expect(stepWeaponDie("d10")).toBe("d8");
    expect(stepWeaponDie("d8")).toBe("d6");
    expect(stepWeaponDie("d6")).toBe("d4");
  });
  it("leaves a die unrecognized/at floor unchanged", () => {
    expect(stepWeaponDie("d4")).toBe("d4");
  });
  it("steps a weapon die up one size (Act Decisively)", () => {
    expect(stepWeaponDieUp("d4")).toBe("d6");
    expect(stepWeaponDieUp("d10")).toBe("d12");
  });
});

describe("Usage Die step-down (§9.3.4)", () => {
  it("steps down one size per roll", () => {
    expect(stepDownDie("d12")).toBe("d10");
    expect(stepDownDie("d10")).toBe("d8");
  });
  it("a d4 that steps down becomes depleted", () => {
    expect(stepDownDie("d4")).toBe("depleted");
  });
});

describe("occupiesSlotWhenDepleted", () => {
  it("containers (Water, Medical, Repair) keep their slot when empty", () => {
    expect(occupiesSlotWhenDepleted("Water")).toBe(true);
    expect(occupiesSlotWhenDepleted("Medical")).toBe(true);
    expect(occupiesSlotWhenDepleted("Repair")).toBe(true);
  });
  it("pure consumables (Rations, Ammunition, Fuel, Fodder) free their slot when empty", () => {
    expect(occupiesSlotWhenDepleted("Rations")).toBe(false);
    expect(occupiesSlotWhenDepleted("Ammunition")).toBe(false);
    expect(occupiesSlotWhenDepleted("Fuel")).toBe(false);
    expect(occupiesSlotWhenDepleted("Fodder")).toBe(false);
  });
});

describe("Equipment Quality & Condition (§9.3.1, §9.3.3)", () => {
  it("Shoddy goes straight to Destroyed on its first degrade", () => {
    const item = gear({ quality: "Shoddy", condition: "Healthy" });
    degradeCondition(item);
    expect(item.condition).toBe("Destroyed");
  });

  it("Masterwork's Reserve absorbs the first degrade from Healthy for free", () => {
    const item = gear({ quality: "Masterwork", condition: "Healthy" });
    degradeCondition(item);
    expect(item.condition).toBe("Healthy");
    expect(item.masterworkReserveSpent).toBe(true);
    // second degrade follows the normal track
    degradeCondition(item);
    expect(item.condition).toBe("Damaged");
  });

  it("Standard follows the normal Healthy -> Damaged -> Broken -> Destroyed track", () => {
    const item = gear({ quality: "Standard", condition: "Healthy" });
    degradeCondition(item);
    expect(item.condition).toBe("Damaged");
    degradeCondition(item);
    expect(item.condition).toBe("Broken");
    degradeCondition(item);
    expect(item.condition).toBe("Destroyed");
    degradeCondition(item); // already at the end, stays put
    expect(item.condition).toBe("Destroyed");
  });

  it("Destroyed cannot be repaired", () => {
    const item = gear({ quality: "Standard", condition: "Destroyed" });
    repairCondition(item);
    expect(item.condition).toBe("Destroyed");
  });

  it("repair steps back up one Condition", () => {
    const item = gear({ quality: "Standard", condition: "Broken" });
    repairCondition(item);
    expect(item.condition).toBe("Damaged");
  });

  it("hasArmorProperty is false once Broken or Destroyed, or unequipped", () => {
    const healthy = gear({ properties: ["Deflective"], condition: "Healthy", equipped: true });
    expect(hasArmorProperty(healthy, "Deflective")).toBe(true);
    const broken = gear({ properties: ["Deflective"], condition: "Broken", equipped: true });
    expect(hasArmorProperty(broken, "Deflective")).toBe(false);
    const unequipped = gear({ properties: ["Deflective"], condition: "Healthy", equipped: false });
    expect(hasArmorProperty(unequipped, "Deflective")).toBe(false);
  });
});

describe("Character Level (§7.3)", () => {
  it("returns Novice at 0 XP and the correct row at each threshold", () => {
    expect(levelForXP(0)).toEqual({ level: 1, title: "Novice" });
    expect(levelForXP(1500)).toEqual({ level: 2, title: "Proven" });
    expect(levelForXP(1499)).toEqual({ level: 1, title: "Novice" });
    expect(levelForXP(400000)).toEqual({ level: 10, title: "Visionary" });
  });
  it("titleForLevel is the inverse lookup", () => {
    expect(titleForLevel(1)).toBe("Novice");
    expect(titleForLevel(10)).toBe("Visionary");
  });
});

describe("Attribute Growth (§7.5)", () => {
  it("grows when the roll beats the unreduced maximum and it's below 18", () => {
    expect(attributeGrows(15, 10)).toBe(true);
  });
  it("does not grow on a tie or a lower roll", () => {
    expect(attributeGrows(10, 10)).toBe(false);
    expect(attributeGrows(9, 10)).toBe(false);
  });
  it("never grows an Attribute already at 18, regardless of the roll", () => {
    expect(attributeGrows(18, 18)).toBe(false);
  });
  it("lowestAttributes finds the single lowest", () => {
    expect(lowestAttributes({ STR: 12, DEX: 8, INT: 10, WIL: 14 })).toEqual(["DEX"]);
  });
  it("lowestAttributes returns every Attribute tied for lowest", () => {
    expect(lowestAttributes({ STR: 8, DEX: 8, INT: 10, WIL: 14 }).sort()).toEqual(["DEX", "STR"]);
  });
});

describe("Technique capacity by Level (§13.6.1)", () => {
  it("matches the 1-2/3-4/5-7/8-10 -> 1/2/3/4 table", () => {
    expect(techniqueCapacityForLevel(1)).toBe(1);
    expect(techniqueCapacityForLevel(2)).toBe(1);
    expect(techniqueCapacityForLevel(3)).toBe(2);
    expect(techniqueCapacityForLevel(4)).toBe(2);
    expect(techniqueCapacityForLevel(5)).toBe(3);
    expect(techniqueCapacityForLevel(7)).toBe(3);
    expect(techniqueCapacityForLevel(8)).toBe(4);
    expect(techniqueCapacityForLevel(10)).toBe(4);
  });
});

describe("Coin Burden (§9.1.5)", () => {
  const zero = { farthings: 0, silverPennies: 0, goldPieces: 0, goldCrowns: 0 };

  it("is 0 slots at or below each denomination's free threshold", () => {
    expect(coinBurdenSlots({ ...zero, farthings: 1000 })).toBe(0);
    expect(coinBurdenSlots({ ...zero, silverPennies: 250 })).toBe(0);
    expect(coinBurdenSlots({ ...zero, goldPieces: 25 })).toBe(0);
    expect(coinBurdenSlots({ ...zero, goldCrowns: 1 })).toBe(0);
  });

  it("divides the FULL quantity by coins-per-slot above the threshold, rounded up", () => {
    expect(coinBurdenSlots({ ...zero, farthings: 1001 })).toBe(1); // ceil(1001/2000)
    expect(coinBurdenSlots({ ...zero, farthings: 2001 })).toBe(2); // ceil(2001/2000)
    expect(coinBurdenSlots({ ...zero, goldCrowns: 26 })).toBe(2); // ceil(26/25)
  });

  it("tracks each denomination independently rather than combining a total value first", () => {
    // 1001 Farthings (1 slot) + 26 Gold Crowns (2 slots) = 3, not merged into one pool
    expect(coinBurdenSlots({ farthings: 1001, silverPennies: 0, goldPieces: 0, goldCrowns: 26 })).toBe(3);
  });
});

describe("rollScar / rollInjurySite (§14.2, §14.4) - injectable RNG", () => {
  it("rollScar returns the table entry matching the roll", () => {
    const { roll, entry } = rollScar(12, () => 10);
    expect(roll).toBe(10);
    expect(entry.name).toBe("Mutilation");
  });
  it("rollInjurySite returns the table entry matching the roll", () => {
    const entry = rollInjurySite(() => 10);
    expect(entry.location).toBe("Head");
  });
});
