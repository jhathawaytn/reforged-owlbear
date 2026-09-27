import { describe, it, expect } from "vitest";
import {
  defaultPC,
  filledSlots,
  inventoryCapacity,
  isOverburdened,
  slotsForZone,
  zoneCapacity,
  totalArmor,
  hasIronDiscipline,
  resolveDeflectStep,
  startCombat,
  endCombat,
  advanceCombatStage,
  canUseTechnique,
  useTechnique,
  careerPicksTotal,
  careerPicksSpent,
  ageXPDelta,
  levelUpAvailable,
  withDefaults,
} from "./ReforgedCharacter";
import type { ReforgedCharacter, GearItem } from "../types";

function withGear(gear: GearItem[], overrides: Partial<ReforgedCharacter> = {}): ReforgedCharacter {
  return { ...defaultPC(), gear, ...overrides };
}

function gear(overrides: Partial<GearItem> = {}): GearItem {
  return { id: "g1", name: "Test Item", zone: "Hand", slots: 1, equipped: true, notes: "", ...overrides };
}

describe("Inventory capacity & slots (§9.1.1)", () => {
  it("capacity equals current STR", () => {
    const pc = withGear([], { attributes: { STR: 13, DEX: 10, INT: 10, WIL: 10 }, attributeMax: { STR: 13, DEX: 10, INT: 10, WIL: 10 } });
    expect(inventoryCapacity(pc)).toBe(13);
  });

  it("exactly at capacity is full but not Overburdened", () => {
    const pc = withGear([gear({ slots: 10 })], { attributes: { STR: 10, DEX: 10, INT: 10, WIL: 10 } });
    expect(filledSlots(pc)).toBe(10);
    expect(isOverburdened(pc)).toBe(false);
  });

  it("Overburdened only once filled slots EXCEED STR", () => {
    const pc = withGear([gear({ slots: 11 })], { attributes: { STR: 10, DEX: 10, INT: 10, WIL: 10 } });
    expect(isOverburdened(pc)).toBe(true);
  });

  it("Strain, Fatigue, and Injuries each count as 1 slot", () => {
    const pc = withGear([], {
      strain: 2,
      fatigue: 1,
      injuries: [{ id: "i1", severity: "Light", location: "Leg", notes: "" }],
    });
    expect(filledSlots(pc)).toBe(4); // 2 + 1 + 1
  });

  it("coin burden adds to filled slots (§9.1.5)", () => {
    const pc = withGear([], { farthings: 2001 }); // ceil(2001/2000) = 2
    expect(filledSlots(pc)).toBe(2);
  });

  it("a dropped Backpack removes Backpack-zone gear but not Strain/Fatigue/Injuries/coin", () => {
    const pc = withGear([gear({ zone: "Backpack", slots: 5 })], {
      backpackDropped: true,
      strain: 1,
      fatigue: 1,
      farthings: 1001,
    });
    expect(filledSlots(pc)).toBe(3); // strain 1 + fatigue 1 + coin burden 1, backpack gear itself gone
  });

  it("a depleted pure-consumable frees its slot; a depleted container keeps it", () => {
    const consumable = gear({ id: "c1", usageKind: "Rations", usageDie: "depleted", slots: 1 });
    const container = gear({ id: "c2", usageKind: "Water", usageDie: "depleted", slots: 1 });
    const pc = withGear([consumable, container]);
    expect(filledSlots(pc)).toBe(1); // only the container still counts
  });
});

describe("Inventory zones (§9.1.2)", () => {
  it("Hand and Handy cap at 2, Worn at floor(STR/2)", () => {
    const pc = withGear([], { attributes: { STR: 13, DEX: 10, INT: 10, WIL: 10 } });
    expect(zoneCapacity(pc, "Hand")).toBe(2);
    expect(zoneCapacity(pc, "Handy")).toBe(2);
    expect(zoneCapacity(pc, "Worn")).toBe(6); // floor(13/2)
  });

  it("slotsForZone only counts items actually in that zone", () => {
    const pc = withGear([gear({ zone: "Hand" }), gear({ id: "g2", zone: "Backpack", slots: 3 })]);
    expect(slotsForZone(pc, "Hand")).toBe(1);
    expect(slotsForZone(pc, "Backpack")).toBe(3);
  });
});

describe("Total Armor (§13.13)", () => {
  it("sums equipped Armor pieces' A-value", () => {
    const pc = withGear([
      gear({ id: "a1", armorValue: 2, equipped: true, condition: "Healthy" }),
      gear({ id: "a2", armorValue: 1, equipped: true, condition: "Damaged" }),
    ]);
    expect(totalArmor(pc)).toBe(3); // Damaged still gives full protection
  });

  it("Broken or Destroyed armor contributes 0", () => {
    const pc = withGear([
      gear({ id: "a1", armorValue: 2, equipped: true, condition: "Broken" }),
      gear({ id: "a2", armorValue: 1, equipped: true, condition: "Destroyed" }),
    ]);
    expect(totalArmor(pc)).toBe(0);
  });

  it("unequipped armor never counts", () => {
    const pc = withGear([gear({ armorValue: 4, equipped: false, condition: "Healthy" })]);
    expect(totalArmor(pc)).toBe(0);
  });
});

describe("Iron Discipline & Deflect (§9.5.7, §13.10.3)", () => {
  it("without Iron Discipline, Deflect just degrades the armor", () => {
    const item = gear({ quality: "Standard", condition: "Healthy" });
    const pc = withGear([item]);
    resolveDeflectStep(pc, item);
    expect(item.condition).toBe("Damaged");
    expect(pc.armorWear).toBe(false);
  });

  it("with Iron Discipline, the first Deflect marks Armor Wear instead of degrading", () => {
    const item = gear({ quality: "Standard", condition: "Healthy" });
    const pc = withGear([item], { skillTreeNodes: [{ tree: "Armor", node: "R3", free: false }] });
    expect(hasIronDiscipline(pc)).toBe(true);
    resolveDeflectStep(pc, item);
    expect(pc.armorWear).toBe(true);
    expect(item.condition).toBe("Healthy");
  });

  it("the second Deflect (with Armor Wear already marked) clears it and degrades normally", () => {
    const item = gear({ quality: "Standard", condition: "Healthy" });
    const pc = withGear([item], {
      skillTreeNodes: [{ tree: "Armor", node: "R3", free: false }],
      armorWear: true,
    });
    resolveDeflectStep(pc, item);
    expect(pc.armorWear).toBe(false);
    expect(item.condition).toBe("Damaged");
  });

  it("Masterwork Reserve still resolves before Iron Discipline", () => {
    const item = gear({ quality: "Masterwork", condition: "Healthy" });
    const pc = withGear([item], { skillTreeNodes: [{ tree: "Armor", node: "R3", free: false }] });
    resolveDeflectStep(pc, item);
    expect(item.masterworkReserveSpent).toBe(true);
    expect(item.condition).toBe("Healthy");
    expect(pc.armorWear).toBe(false); // Iron Discipline never triggered this time
  });
});

describe("Combat lifecycle & Techniques (§13.0-§13.6.1)", () => {
  it("startCombat resets stage to Initiative and clears per-combat trackers", () => {
    const pc = defaultPC();
    startCombat(pc);
    expect(pc.combatActive).toBe(true);
    expect(pc.combatStage).toBe("Initiative");
    expect(pc.frayRound).toBe(0);
    expect(pc.techniquesUsedNames).toEqual([]);
  });

  it("endCombat clears Strain (§13.11.4) but startCombat does not", () => {
    const pc = defaultPC();
    pc.strain = 3;
    startCombat(pc);
    expect(pc.strain).toBe(3);
    endCombat(pc);
    expect(pc.strain).toBe(0);
    expect(pc.combatActive).toBe(false);
  });

  it("advanceCombatStage goes Initiative -> Clash -> Fray, then increments Fray Round", () => {
    const pc = defaultPC();
    startCombat(pc);
    advanceCombatStage(pc);
    expect(pc.combatStage).toBe("Clash");
    advanceCombatStage(pc);
    expect(pc.combatStage).toBe("Fray");
    expect(pc.frayRound).toBe(1);
    advanceCombatStage(pc);
    expect(pc.combatStage).toBe("Fray");
    expect(pc.frayRound).toBe(2);
  });

  it("canUseTechnique is false outside combat", () => {
    const pc = defaultPC();
    expect(canUseTechnique(pc, "Take the Initiative")).toBe(false);
  });

  it("enforces overall per-combat capacity by Level", () => {
    const pc = defaultPC();
    pc.level = 1; // capacity 1
    startCombat(pc);
    expect(canUseTechnique(pc, "Take the Initiative")).toBe(true);
    useTechnique(pc, "Take the Initiative");
    pc.techniqueUsedThisStageInstance = false; // simulate moving to a new stage instance
    expect(canUseTechnique(pc, "Seize the Advantage")).toBe(false); // capacity spent
  });

  it("enforces one Technique per named ability per combat", () => {
    const pc = defaultPC();
    pc.level = 8; // capacity 4, so this test isolates the per-name rule
    startCombat(pc);
    useTechnique(pc, "Take the Initiative");
    pc.techniqueUsedThisStageInstance = false;
    expect(canUseTechnique(pc, "Take the Initiative")).toBe(false); // already used this combat
  });

  it("enforces at most one Technique per stage instance", () => {
    const pc = defaultPC();
    pc.level = 8;
    startCombat(pc);
    useTechnique(pc, "Take the Initiative");
    expect(canUseTechnique(pc, "Seize the Advantage")).toBe(false); // same stage instance
    advanceCombatStage(pc);
    expect(canUseTechnique(pc, "Seize the Advantage")).toBe(true); // new stage instance
  });
});

describe("Career Picks (§3.3, §3.8)", () => {
  it("total is 0 with no Age set", () => {
    expect(careerPicksTotal(defaultPC())).toBe(0);
  });
  it("total comes from the Age table once Age is set", () => {
    const pc = { ...defaultPC(), age: "Prime" as const };
    expect(careerPicksTotal(pc)).toBe(2);
  });
  it("spent counts only free-flagged nodes/talents", () => {
    const pc = {
      ...defaultPC(),
      skillTreeNodes: [{ tree: "Armor" as const, node: "R1" as const, free: true }, { tree: "Armor" as const, node: "R1A" as const, free: false }],
      talentsOwned: [{ category: "Test", name: "Steadfast", free: true }],
    };
    expect(careerPicksSpent(pc)).toBe(2);
  });
});

describe("Starting XP delta on Age change (§3.3)", () => {
  it("records the new Age's Starting XP as XP Earned", () => {
    const pc = defaultPC();
    const delta = ageXPDelta(pc, "Very Old");
    expect(delta.xpEarned).toBe(1000);
    expect(delta.startingXPApplied).toBe(1000);
  });
  it("backs out the previous Age's contribution before adding the new one", () => {
    let pc = defaultPC();
    let delta = ageXPDelta(pc, "Very Old");
    pc = { ...pc, age: "Very Old", ...delta };
    delta = ageXPDelta(pc, "Young Adult");
    expect(pc.xpEarned + (delta.xpEarned - pc.xpEarned)).toBe(0); // net XP earned resets to 0
    expect(delta.xpEarned).toBe(0);
    expect(delta.startingXPApplied).toBe(0);
  });
});

describe("Level Up availability (§7.4)", () => {
  it("is unavailable when XP Earned doesn't clear the next threshold", () => {
    const pc = { ...defaultPC(), level: 1, xpEarned: 1000 };
    expect(levelUpAvailable(pc)).toBe(false);
  });
  it("is available once XP Earned qualifies for a Level beyond the confirmed one", () => {
    const pc = { ...defaultPC(), level: 1, xpEarned: 1500 };
    expect(levelUpAvailable(pc)).toBe(true);
  });
  it("stays available for the next session even if XP Earned qualifies several Levels ahead", () => {
    const pc = { ...defaultPC(), level: 1, xpEarned: 100000 };
    expect(levelUpAvailable(pc)).toBe(true);
  });
  it("goes false again right after Level catches up by exactly one", () => {
    const pc = { ...defaultPC(), level: 2, xpEarned: 1500 };
    expect(levelUpAvailable(pc)).toBe(false);
  });
});

describe("withDefaults migration", () => {
  it("fills in every new field for an empty/old save", () => {
    const migrated = withDefaults({});
    expect(migrated.attributeMax).toEqual({ STR: 10, DEX: 10, INT: 10, WIL: 10 });
    expect(migrated.hamletConnection).toHaveLength(6);
  });

  it("derives attributeMax from an old save's current attributes when the field is missing", () => {
    const migrated = withDefaults({ attributes: { STR: 15, DEX: 8, INT: 12, WIL: 9 } });
    expect(migrated.attributeMax).toEqual({ STR: 15, DEX: 8, INT: 12, WIL: 9 });
  });

  it("keeps an already-diverged attributeMax as-is", () => {
    const migrated = withDefaults({
      attributes: { STR: 9, DEX: 10, INT: 10, WIL: 10 },
      attributeMax: { STR: 10, DEX: 10, INT: 10, WIL: 10 },
    });
    expect(migrated.attributeMax.STR).toBe(10);
    expect(migrated.attributes.STR).toBe(9);
  });
});
