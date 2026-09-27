import { writable } from "svelte/store";
import { createUndoRedoStore } from "../services/PlayerHistoryTracker";
import { occupiesSlotWhenDepleted, AGE_TABLE, levelForXP, degradeCondition, techniqueCapacityForLevel, coinBurdenSlots } from "../types";
import type { ReforgedCharacter, GearZone, GearItem, TechniqueName } from "../types";

export function defaultPC(): ReforgedCharacter {
  return {
    name: "",
    playerName: "",
    ancestry: "",
    heritage: "",
    languages: "",
    age: "",
    definingTrait: "",
    formativeExperience: "",
    arcaneFeat: "",
    hamletConnection: ["", "", "", "", "", ""],
    companyConnection: ["", "", "", "", "", ""],
    backgroundOverride: "",

    attributesRolled: false,
    attributeSwapUsed: false,
    hpRolled: false,
    definingTraitRolled: false,
    definingTraitRerollUsed: false,
    formativeExperienceApplied: false,
    ageAdjustmentApplied: false,
    startingKitApplied: false,
    startingXPApplied: 0,
    characterCreationFinalized: false,
    trinkets: [],

    careers: [],
    level: 1,
    xpEarned: 0,
    xpAvailable: 0,

    attributes: { STR: 10, DEX: 10, INT: 10, WIL: 10 },
    attributeMax: { STR: 10, DEX: 10, INT: 10, WIL: 10 },

    hitPoints: 4,
    maxHitPoints: 4,
    strain: 0,

    combatActive: false,
    combatStage: null,
    frayRound: 0,
    techniquesUsedNames: [],
    techniqueUsedThisStageInstance: false,

    attacks: [],

    skillTreeNodes: [],
    talentsOwned: [],
    skillsAndTalents: "",
    hooks: "",
    notes: "",

    farthings: 0,
    silverPennies: 0,
    goldPieces: 0,
    goldCrowns: 0,

    gear: [],
    conditions: [],
    fatigue: 0,
    injuries: [],
    backpackDropped: false,

    mortalWound: false,
    armorWear: false,
    doomActive: false,
    temperedPending: false,
    impairedNextAction: false,
    scars: [],
  };
}

export const PlayerCharacterStore = createUndoRedoStore(
  writable<ReforgedCharacter>(defaultPC()),
);
export const pc = PlayerCharacterStore;

// Total Inventory capacity equals current STR (Ch.9, §9.1.1).
export function inventoryCapacity(pc: ReforgedCharacter): number {
  return pc.attributes.STR;
}

// Strain counts toward carried Inventory 1-for-1 (§13.11.3), alongside
// each gear item's own slot cost. A depleted Usage Die item stops counting
// its slot UNLESS it's a container-based resource (Waterskin, kits) whose
// empty container is still physically carried - see occupiesSlotWhenDepleted.
function countsTowardSlots(g: { slots: number; usageDie?: string; usageKind?: import("../types").UsageKind }): number {
  if (g.usageDie === "depleted" && !occupiesSlotWhenDepleted(g.usageKind)) return 0;
  return g.slots;
}

export function filledSlots(pc: ReforgedCharacter): number {
  const gearSlots = pc.gear
    .filter((g) => !(pc.backpackDropped && g.zone === "Backpack"))
    .reduce((acc, g) => acc + countsTowardSlots(g), 0);
  // Strain, Fatigue, and Injuries each take 1 slot and are carried on the
  // body, so a dropped Backpack never removes them. Coin burden (§9.1.5) is
  // likewise a flat addition, independent of any zone or container.
  const coinSlots = coinBurdenSlots({
    farthings: pc.farthings,
    silverPennies: pc.silverPennies,
    goldPieces: pc.goldPieces,
    goldCrowns: pc.goldCrowns,
  });
  return gearSlots + pc.strain + (pc.fatigue ?? 0) + (pc.injuries?.length ?? 0) + coinSlots;
}

export function isOverburdened(pc: ReforgedCharacter): boolean {
  return filledSlots(pc) > inventoryCapacity(pc);
}

export function slotsForZone(pc: ReforgedCharacter, zone: GearZone): number {
  return pc.gear.filter((g) => g.zone === zone).reduce((acc, g) => acc + countsTowardSlots(g), 0);
}

// Soft display caps per zone (§9.1.2) - shown as a warning, not enforced.
export function zoneCapacity(pc: ReforgedCharacter, zone: GearZone): number {
  switch (zone) {
    case "Hand":
      return 2;
    case "Handy":
      return 2;
    case "Worn":
      return Math.floor(pc.attributes.STR / 2);
    case "Backpack":
      return Math.max(0, inventoryCapacity(pc) - filledSlots(pc) + slotsForZone(pc, "Backpack"));
  }
}

// Total Armor = sum of equipped armor pieces' A-value (§13.13's exact
// stacking rule - Talent bonuses, Armor Expert, Shield Wall, etc. - isn't
// modeled here; this is a plain sum with the A4 ceiling shown as a note).
// Broken/Destroyed armor provides 0 Armor and can't Deflect (§9.13);
// Damaged armor still provides full protection.
export function totalArmor(pc: ReforgedCharacter): number {
  return pc.gear
    .filter((g) => g.equipped && g.armorValue !== undefined && g.condition !== "Broken" && g.condition !== "Destroyed")
    .reduce((acc, g) => acc + (g.armorValue ?? 0), 0);
}

// Iron Discipline is the Armor Skill Tree's R3 node (§9.5.7's shared Armor
// Wear box only applies if the character owns it).
export function hasIronDiscipline(pc: ReforgedCharacter): boolean {
  return pc.skillTreeNodes.some((n) => n.tree === "Armor" && n.node === "R3");
}

// One Deflect Condition step (§13.10.3, §9.5.7). Sequence: Masterwork
// Reserve resolves first (degradeCondition already handles that internally);
// otherwise, if the character has Iron Discipline, the shared Armor Wear box
// absorbs every other step instead of the armor actually degrading.
export function resolveDeflectStep(pc: ReforgedCharacter, item: GearItem): void {
  if (item.quality === "Masterwork" && item.condition === "Healthy" && !item.masterworkReserveSpent) {
    degradeCondition(item);
    return;
  }
  if (hasIronDiscipline(pc)) {
    if (!pc.armorWear) {
      pc.armorWear = true;
      return;
    }
    pc.armorWear = false;
  }
  degradeCondition(item);
}

// Combat lifecycle (§13.0-§13.4). Starting combat resets both per-combat
// Technique trackers; ending it also clears Strain per §13.11.4 ("once the
// encounter has genuinely ended") - a deliberate manual action, so Strain
// correctly stays if the player doesn't click it while danger continues.
export function startCombat(pc: ReforgedCharacter): void {
  pc.combatActive = true;
  pc.combatStage = "Initiative";
  pc.frayRound = 0;
  pc.techniquesUsedNames = [];
  pc.techniqueUsedThisStageInstance = false;
}

export function endCombat(pc: ReforgedCharacter): void {
  pc.combatActive = false;
  pc.combatStage = null;
  pc.frayRound = 0;
  pc.strain = 0;
  pc.techniquesUsedNames = [];
  pc.techniqueUsedThisStageInstance = false;
}

// Advances Initiative -> Clash -> Fray, then loops within Fray (a new Fray
// Round). Each advance resets the per-stage-instance Technique lock - at
// most one Technique may be used per Initiative, per Clash, or per
// individual Fray Round (§13.6.1).
export function advanceCombatStage(pc: ReforgedCharacter): void {
  if (pc.combatStage === "Initiative") {
    pc.combatStage = "Clash";
  } else if (pc.combatStage === "Clash") {
    pc.combatStage = "Fray";
    pc.frayRound = 1;
  } else if (pc.combatStage === "Fray") {
    pc.frayRound += 1;
  }
  pc.techniqueUsedThisStageInstance = false;
}

// All three Technique limits at once: overall per-combat capacity, each
// named Technique usable only once per combat, and at most one Technique
// per Initiative/Clash/Fray-round (§13.6.1).
export function canUseTechnique(pc: ReforgedCharacter, name: TechniqueName): boolean {
  if (!pc.combatActive) return false;
  if (pc.techniqueUsedThisStageInstance) return false;
  if (pc.techniquesUsedNames.includes(name)) return false;
  if (pc.techniquesUsedNames.length >= techniqueCapacityForLevel(pc.level)) return false;
  return true;
}

export function useTechnique(pc: ReforgedCharacter, name: TechniqueName): void {
  pc.techniquesUsedNames = [...pc.techniquesUsedNames, name];
  pc.techniqueUsedThisStageInstance = true;
}

// Career Picks (§3.3, §3.8): Age grants a fixed number of picks, each spent
// as a "free" Skill Tree Rank or Talent in the picker. Not tracked as its
// own field - derived from Age plus the free-flagged picks already made.
export function careerPicksTotal(pc: ReforgedCharacter): number {
  return pc.age ? AGE_TABLE[pc.age].careerPicks : 0;
}
export function careerPicksSpent(pc: ReforgedCharacter): number {
  return pc.skillTreeNodes.filter((n) => n.free).length + pc.talentsOwned.filter((t) => t.free).length;
}

// Age's Starting XP (§3.3) is recorded as XP Earned immediately, but Age can
// be changed more than once while exploring Character Creation - back out
// whatever this character's current Age previously contributed before
// adding the new amount, so repeated changes never double up.
export function ageXPDelta(
  pc: ReforgedCharacter,
  newAge: import("../types").Age,
): { xpEarned: number; startingXPApplied: number } {
  const newXP = newAge ? AGE_TABLE[newAge].startingXP : 0;
  const xpEarned = pc.xpEarned - pc.startingXPApplied + newXP;
  return { xpEarned, startingXPApplied: newXP };
}

// Meeting an XP Earned threshold doesn't grant a Level "in the field" (§7.4) -
// resolving it (HP Growth + Attribute Growth, §7.5) is the deliberate Level
// Up action below, one Level at a time even if XP Earned already qualifies
// for more than one Level ahead (the extra XP isn't lost - see §7.4's example).
export function levelUpAvailable(pc: ReforgedCharacter): boolean {
  return levelForXP(pc.xpEarned).level > pc.level;
}

// Older saves predate newer fields - merge onto defaults so nothing is undefined.
export function withDefaults(c: Partial<ReforgedCharacter> | undefined): ReforgedCharacter {
  const merged = { ...defaultPC(), ...(c ?? {}) } as ReforgedCharacter;
  // A save from before attributeMax existed has no way to know what its
  // Attributes' unreduced maximum should be - the best available guess is
  // its current Attributes (i.e. assume no Permanent Injury/Growth gap yet).
  if (!c?.attributeMax) {
    merged.attributeMax = { ...merged.attributes };
  }
  return merged;
}
