// Equipment data pulled directly from the manuscript's Ch.9 Equipment Tables
// (§9.11.1-9.11.9). Kept to the "ordinary core equipment for fast purchasing
// and reference" tables - it does not include animals/tack/vehicles (Company
// gear, not personal Inventory) or the full Quality/Condition/Stress rules.

import { get } from "svelte/store";
import { newId, parseAndRoll } from "./utils";
import type { GearItem, GearZone, ReforgedCharacter } from "./types";
import type { UndoRedoStore } from "./services/PlayerHistoryTracker";
import { notify } from "./services/Notifier";

export type GearCategory =
  | "Weapon"
  | "Armor"
  | "Ammunition"
  | "Container"
  | "Utility"
  | "Food & Water"
  | "Light"
  | "Medical";

export type WeaponProfile = "Quick" | "Balanced" | "Slow" | "Ranged";

export type CompendiumWeapon = {
  category: "Weapon";
  name: string;
  profile: WeaponProfile;
  damageDie: string; // e.g. "d6"
  damageType: "Slashing" | "Piercing" | "Bludgeoning";
  range?: "Close" | "Near" | "Far";
  slots: number;
  properties: string;
  specialStress: string;
  price: string;
  rarity: number;
};

export type CompendiumArmor = {
  category: "Armor";
  name: string;
  armor: string; // "A1", "A0", etc.
  slots: number;
  price: string;
  rarity: number;
  notes: string;
  // Structured properties that affect damage-intake math (§9.5.4-9.5.5) -
  // "notes" stays display-only text since its wording isn't stable enough
  // to keyword-match (e.g. Buckler's notes literally say "no Shield
  // Sacrifice", which would false-positive a naive notes.includes check).
  properties?: string[];
};

export type CompendiumMisc = {
  category: Exclude<GearCategory, "Weapon" | "Armor">;
  name: string;
  slots: number;
  price: string;
  rarity: number;
  notes: string;
  usageKind?: import("./types").UsageKind;
  usageDie?: import("./types").DieSize;
};

export type CompendiumItem = CompendiumWeapon | CompendiumArmor | CompendiumMisc;

const meleeWeapons: CompendiumWeapon[] = [
  { category: "Weapon", name: "Dagger", profile: "Quick", damageDie: "d6", damageType: "Piercing", slots: 1, properties: "Concealable, Thrown", specialStress: "-", price: "10 SP", rarity: 1 },
  { category: "Weapon", name: "Handaxe", profile: "Quick", damageDie: "d6", damageType: "Slashing", slots: 1, properties: "Thrown", specialStress: "-", price: "10 SP", rarity: 1 },
  { category: "Weapon", name: "Club", profile: "Quick", damageDie: "d6", damageType: "Bludgeoning", slots: 1, properties: "Subduing", specialStress: "-", price: "negligible", rarity: 1 },
  { category: "Weapon", name: "Shortsword", profile: "Quick", damageDie: "d6", damageType: "Slashing", slots: 1, properties: "-", specialStress: "Vicious", price: "100 SP", rarity: 2 },
  { category: "Weapon", name: "Blackjack", profile: "Quick", damageDie: "d6", damageType: "Bludgeoning", slots: 1, properties: "Concealable, Subduing", specialStress: "-", price: "5 SP", rarity: 1 },
  { category: "Weapon", name: "Stiletto", profile: "Quick", damageDie: "d6", damageType: "Piercing", slots: 1, properties: "Concealable", specialStress: "-", price: "15 SP", rarity: 2 },
  { category: "Weapon", name: "Staff", profile: "Balanced", damageDie: "d8", damageType: "Bludgeoning", slots: 1, properties: "Reach", specialStress: "Guarding", price: "3 SP", rarity: 1 },
  { category: "Weapon", name: "Spear", profile: "Balanced", damageDie: "d8", damageType: "Piercing", slots: 1, properties: "Reach", specialStress: "-", price: "10 SP", rarity: 1 },
  { category: "Weapon", name: "Battle Axe", profile: "Balanced", damageDie: "d8", damageType: "Slashing", slots: 1, properties: "-", specialStress: "Cleaving", price: "50 SP", rarity: 2 },
  { category: "Weapon", name: "Mace", profile: "Balanced", damageDie: "d8", damageType: "Bludgeoning", slots: 1, properties: "-", specialStress: "Brutal", price: "13 SP", rarity: 2 },
  { category: "Weapon", name: "Longsword", profile: "Balanced", damageDie: "d8", damageType: "Slashing", slots: 1, properties: "-", specialStress: "Guarding", price: "150 SP", rarity: 3 },
  { category: "Weapon", name: "War Pick", profile: "Balanced", damageDie: "d8", damageType: "Piercing", slots: 1, properties: "-", specialStress: "Breaching", price: "20 SP", rarity: 2 },
  { category: "Weapon", name: "Flail", profile: "Balanced", damageDie: "d8", damageType: "Bludgeoning", slots: 1, properties: "Flexible", specialStress: "-", price: "25 SP", rarity: 2 },
  { category: "Weapon", name: "Rapier", profile: "Balanced", damageDie: "d8", damageType: "Piercing", slots: 1, properties: "-", specialStress: "Precise", price: "150 SP", rarity: 3 },
  { category: "Weapon", name: "Scimitar", profile: "Balanced", damageDie: "d8", damageType: "Slashing", slots: 1, properties: "-", specialStress: "Cleaving", price: "150 SP", rarity: 3 },
  { category: "Weapon", name: "Greatsword", profile: "Slow", damageDie: "d10", damageType: "Slashing", slots: 2, properties: "Bulky", specialStress: "Cleaving", price: "200 SP", rarity: 3 },
  { category: "Weapon", name: "Warhammer", profile: "Slow", damageDie: "d10", damageType: "Bludgeoning", slots: 2, properties: "Bulky", specialStress: "Breaching", price: "25 SP", rarity: 2 },
  { category: "Weapon", name: "Greataxe", profile: "Slow", damageDie: "d10", damageType: "Slashing", slots: 2, properties: "Bulky", specialStress: "Brutal", price: "25 SP", rarity: 2 },
  { category: "Weapon", name: "Pike", profile: "Slow", damageDie: "d10", damageType: "Piercing", slots: 2, properties: "Reach, Bulky", specialStress: "-", price: "20 SP", rarity: 2 },
  { category: "Weapon", name: "Poleaxe", profile: "Slow", damageDie: "d10", damageType: "Slashing", slots: 2, properties: "Reach, Bulky", specialStress: "Breaching", price: "30 SP", rarity: 2 },
  { category: "Weapon", name: "Halberd", profile: "Slow", damageDie: "d10", damageType: "Slashing", slots: 2, properties: "Reach, Bulky", specialStress: "Cleaving", price: "38 SP", rarity: 2 },
  { category: "Weapon", name: "Billhook", profile: "Slow", damageDie: "d10", damageType: "Slashing", slots: 2, properties: "Reach, Hooked, Bulky", specialStress: "-", price: "45 SP", rarity: 2 },
  { category: "Weapon", name: "Lance", profile: "Slow", damageDie: "d10", damageType: "Piercing", slots: 2, properties: "Reach, Bulky (mounted use)", specialStress: "-", price: "60 SP", rarity: 2 },
];

const rangedWeapons: CompendiumWeapon[] = [
  { category: "Weapon", name: "Sling", profile: "Ranged", damageDie: "d6", damageType: "Bludgeoning", range: "Close", slots: 0, properties: "Concealable", specialStress: "-", price: "3 SP", rarity: 1 },
  { category: "Weapon", name: "Hand Crossbow", profile: "Ranged", damageDie: "d6", damageType: "Piercing", range: "Close", slots: 1, properties: "Concealable, Loading", specialStress: "-", price: "38 SP", rarity: 3 },
  { category: "Weapon", name: "Shortbow", profile: "Ranged", damageDie: "d6", damageType: "Piercing", range: "Near", slots: 1, properties: "-", specialStress: "-", price: "13 SP", rarity: 1 },
  { category: "Weapon", name: "Hunting Bow", profile: "Ranged", damageDie: "d8", damageType: "Piercing", range: "Near", slots: 1, properties: "-", specialStress: "-", price: "25 SP", rarity: 2 },
  { category: "Weapon", name: "Longbow", profile: "Ranged", damageDie: "d8", damageType: "Piercing", range: "Far", slots: 2, properties: "Bulky", specialStress: "Breaching", price: "50 SP", rarity: 2 },
  { category: "Weapon", name: "Crossbow", profile: "Ranged", damageDie: "d10", damageType: "Piercing", range: "Near", slots: 2, properties: "Bulky, Loading", specialStress: "Breaching", price: "38 SP", rarity: 2 },
];

const armor: CompendiumArmor[] = [
  { category: "Armor", name: "Gambeson", armor: "A1", slots: 1, price: "10 SP", rarity: 1, notes: "Warm, Comfort" },
  { category: "Armor", name: "Hardened Leather", armor: "A1", slots: 1, price: "50 SP", rarity: 1, notes: "Rugged" },
  { category: "Armor", name: "Scale", armor: "A1", slots: 2, price: "600 SP", rarity: 2, notes: "Noisy, Bulky, Rugged, Deflective", properties: ["Deflective"] },
  { category: "Armor", name: "Chain", armor: "A1", slots: 2, price: "1,250 SP", rarity: 3, notes: "Noisy, Bulky, Edge-Proof", properties: ["Edge-Proof"] },
  { category: "Armor", name: "Plates", armor: "A1", slots: 2, price: "3,000 SP", rarity: 4, notes: "Noisy, Bulky, Rigid, Stiff, Braced Defense" },
  { category: "Armor", name: "Helm", armor: "A1", slots: 1, price: "100 SP", rarity: 2, notes: "Helm Sacrifice", properties: ["Helm Sacrifice"] },
  { category: "Armor", name: "Buckler", armor: "A0", slots: 1, price: "24 SP", rarity: 2, notes: "Shield; can Block; no Shield Sacrifice" },
  { category: "Armor", name: "Shield", armor: "A1", slots: 1, price: "72 SP", rarity: 1, notes: "Shield Sacrifice", properties: ["Shield Sacrifice"] },
  { category: "Armor", name: "Bracers", armor: "A0", slots: 1, price: "30 SP", rarity: 2, notes: "Disarm protection; sacrifice option" },
  { category: "Armor", name: "Greaves", armor: "A0", slots: 1, price: "30 SP", rarity: 2, notes: "Leg protection; sacrifice option" },
  { category: "Armor", name: "Gauntlets", armor: "A0", slots: 1, price: "50 SP", rarity: 2, notes: "Hazardous handling; unarmed d4+1; sacrifice option" },
];

const ammunition: CompendiumMisc[] = [
  { category: "Ammunition", name: "Sling Stone Pouch", slots: 1, price: "1 SP", rarity: 1, notes: "d10 Usage Die", usageKind: "Ammunition", usageDie: "d10" },
  { category: "Ammunition", name: "Arrow Quiver", slots: 1, price: "13 SP", rarity: 1, notes: "d10 Usage Die", usageKind: "Ammunition", usageDie: "d10" },
  { category: "Ammunition", name: "Bolt Case", slots: 1, price: "6 SP", rarity: 2, notes: "d8 Usage Die", usageKind: "Ammunition", usageDie: "d8" },
  { category: "Ammunition", name: "Thrown Weapon Bundle", slots: 1, price: "10 SP", rarity: 2, notes: "d6 Usage Die", usageKind: "Ammunition", usageDie: "d6" },
];

const containers: CompendiumMisc[] = [
  { category: "Container", name: "Backpack", slots: 0, price: "48 SP", rarity: 1, notes: "0 while worn; unlocks Backpack zone" },
  { category: "Container", name: "Purse", slots: 0, price: "9 SP", rarity: 1, notes: "Petty; does not reduce coin burden" },
  { category: "Container", name: "Scroll Case", slots: 0, price: "15 SP", rarity: 2, notes: "Petty; documents" },
  { category: "Container", name: "Canvas Sack", slots: 0, price: "8 SP", rarity: 1, notes: "Petty; holds up to 3 slots" },
  { category: "Container", name: "Chest", slots: 2, price: "20 SP", rarity: 1, notes: "Holds up to 6 slots" },
  { category: "Container", name: "Short Water Barrel", slots: 2, price: "12 SP", rarity: 1, notes: "Holds 4x d6 Water stocks" },
];

const utility: CompendiumMisc[] = [
  { category: "Utility", name: "Two-Person Tent", slots: 2, price: "27 SP", rarity: 2, notes: "Shelter for two" },
  { category: "Utility", name: "Bedroll", slots: 1, price: "2 SP", rarity: 1, notes: "Portable bedding" },
  { category: "Utility", name: "Tinderbox", slots: 0, price: "6 SP", rarity: 1, notes: "Petty; reliable ignition" },
  { category: "Utility", name: "Iron Pot", slots: 1, price: "2 SP", rarity: 1, notes: "Required for Fancy Meal" },
  { category: "Utility", name: "Chalk", slots: 0, price: "1 fa", rarity: 1, notes: "Petty" },
  { category: "Utility", name: "Pick", slots: 1, price: "8 SP", rarity: 1, notes: "Break/loosen earth, soft stone" },
  { category: "Utility", name: "Hammer", slots: 1, price: "6 SP", rarity: 1, notes: "Drive spikes, pegs, wedges" },
  { category: "Utility", name: "Iron Spike", slots: 0, price: "5 SP each", rarity: 1, notes: "Petty" },
  { category: "Utility", name: "Manacles", slots: 1, price: "15 SP", rarity: 2, notes: "Secure a controllable creature" },
  { category: "Utility", name: "Burglary Tools", slots: 0, price: "30 SP", rarity: 2, notes: "Petty; lock work" },
  { category: "Utility", name: "Whistle", slots: 0, price: "5 SP", rarity: 1, notes: "Petty; sharp signal" },
  { category: "Utility", name: "8-ft Ladder", slots: 2, price: "6 SP", rarity: 1, notes: "Stable access" },
  { category: "Utility", name: "10-ft Pole", slots: 1, price: "2 SP", rarity: 1, notes: "Probe, reach, brace" },
  { category: "Utility", name: "Spade", slots: 1, price: "8 SP", rarity: 1, notes: "Dig loose material" },
  { category: "Utility", name: "Bronze Mirror", slots: 0, price: "5 SP", rarity: 2, notes: "Petty; reflective inspection" },
  { category: "Utility", name: "Crowbar", slots: 1, price: "9 SP", rarity: 1, notes: "Strong leverage" },
  { category: "Utility", name: "Grappling Hook", slots: 1, price: "10 SP", rarity: 2, notes: "Rope anchor" },
  { category: "Utility", name: "Hemp Rope, 50ft", slots: 1, price: "50 SP", rarity: 1, notes: "Bind, haul, lower, raise, climb" },
];

const foodWater: CompendiumMisc[] = [
  { category: "Food & Water", name: "Fresh Rations", slots: 1, price: "-", rarity: 1, notes: "d6 Usage Die; foraged/hunted, spoils on settlement entry, no preservation", usageKind: "Rations", usageDie: "d6" },
  { category: "Food & Water", name: "Trail Rations", slots: 1, price: "25 SP", rarity: 1, notes: "d6 Usage Die", usageKind: "Rations", usageDie: "d6" },
  { category: "Food & Water", name: "Waterskin", slots: 1, price: "10 SP", rarity: 1, notes: "d6 Water; container+water = 1 slot", usageKind: "Water", usageDie: "d6" },
  { category: "Food & Water", name: "Short Water Barrel", slots: 2, price: "12 SP", rarity: 1, notes: "4x d6 Water stocks, simplified here to one d6 tracker", usageKind: "Water", usageDie: "d6" },
  { category: "Food & Water", name: "Firewood Bundle", slots: 1, price: "2 fa", rarity: 1, notes: "d6 Usage Die", usageKind: "Fuel", usageDie: "d6" },
  { category: "Food & Water", name: "Fodder Sack", slots: 2, price: "5 SP", rarity: 1, notes: "d6 Usage Die; 1 mount", usageKind: "Fodder", usageDie: "d6" },
];

const light: CompendiumMisc[] = [
  { category: "Light", name: "Torch Bundle", slots: 1, price: "3 SP", rarity: 1, notes: "d6 Usage Die", usageKind: "Fuel", usageDie: "d6" },
  { category: "Light", name: "Lantern", slots: 1, price: "12 SP", rarity: 2, notes: "Durable, reusable" },
  { category: "Light", name: "Hooded Lantern", slots: 1, price: "18 SP", rarity: 2, notes: "Durable, reusable" },
  { category: "Light", name: "Bullseye Lantern", slots: 1, price: "18 SP", rarity: 2, notes: "Durable, reusable" },
  { category: "Light", name: "Lamp Oil", slots: 1, price: "3 SP", rarity: 1, notes: "d6 Usage Die", usageKind: "Fuel", usageDie: "d6" },
];

const medical: CompendiumMisc[] = [
  { category: "Medical", name: "Physicker's Kit", slots: 2, price: "100 SP", rarity: 2, notes: "includes d8 Medical Supplies", usageKind: "Medical", usageDie: "d8" },
  { category: "Medical", name: "Medical Supplies Restock", slots: 0, price: "60 SP", rarity: 2, notes: "restores Medical Supplies to d8" },
  { category: "Medical", name: "Specialized Medical Supplies", slots: 1, price: "75 SP", rarity: 3, notes: "one procedure" },
  { category: "Medical", name: "Specialized Surgical Supplies", slots: 1, price: "150 SP", rarity: 4, notes: "one procedure" },
  { category: "Medical", name: "Repair Kit", slots: 2, price: "75 SP", rarity: 2, notes: "includes d6 Repair Supplies", usageKind: "Repair", usageDie: "d6" },
  { category: "Medical", name: "Repair Supplies Restock", slots: 0, price: "25 SP", rarity: 2, notes: "restores Repair Supplies to d6" },
  { category: "Medical", name: "Whetstone", slots: 0, price: "2 SP", rarity: 1, notes: "Petty; required for Hone Weapon" },
];

export const COMPENDIUM: CompendiumItem[] = [
  ...meleeWeapons,
  ...rangedWeapons,
  ...armor,
  ...ammunition,
  ...containers,
  ...utility,
  ...foodWater,
  ...light,
  ...medical,
];

export const GEAR_CATEGORIES: GearCategory[] = [
  "Weapon",
  "Armor",
  "Ammunition",
  "Container",
  "Utility",
  "Food & Water",
  "Light",
  "Medical",
];

function defaultZoneFor(category: GearCategory): GearZone {
  switch (category) {
    case "Weapon":
      return "Hand";
    case "Armor":
      return "Worn";
    case "Ammunition":
      return "Handy";
    default:
      return "Backpack";
  }
}

function parseArmorValue(a: string): number {
  const m = a.match(/A(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// Shared shaping from a compendium entry to a sheet GearItem, used by both
// the Gear shop and the Starting Equipment seed below. An explicit id lets
// the Gear shop share one id between the GearItem and the matching Attack
// row it creates for a Weapon, so Attacks & Techniques can read the
// weapon's live Condition and Special Stress Property.
export function compendiumItemToGear(item: CompendiumItem, id: string = newId()): GearItem {
  const hasUsageDie = item.category !== "Weapon" && item.category !== "Armor" && item.usageDie !== undefined;
  const isDurable = item.category === "Weapon" || item.category === "Armor";
  return {
    id,
    name: item.name,
    zone: defaultZoneFor(item.category),
    slots: item.slots,
    equipped: isDurable,
    armorValue: item.category === "Armor" ? parseArmorValue(item.armor) : undefined,
    usageKind: hasUsageDie ? item.usageKind : undefined,
    usageDie: hasUsageDie ? item.usageDie : undefined,
    usageDieMax: hasUsageDie ? item.usageDie : undefined,
    durableCategory: isDurable ? item.category : undefined,
    quality: isDurable ? "Standard" : undefined,
    condition: isDurable ? "Healthy" : undefined,
    properties: item.category === "Armor" ? item.properties : undefined,
    specialStress: item.category === "Weapon" && item.specialStress !== "-" ? item.specialStress : undefined,
    notes: item.category === "Weapon" ? item.properties : item.category === "Armor" ? item.notes : item.notes,
  };
}

// §3.10 Starting Equipment - every character begins with these five items,
// recorded at their listed Usage Die size (Trail Rations/Waterskin/Torch
// Bundle are NOT rolled during character creation).
export const STARTING_KIT_ITEM_NAMES = ["Backpack", "Trail Rations", "Waterskin", "Torch Bundle", "Tinderbox"];

// Shared by the Gear box's "+ Starting Kit" button and the Character
// Creator's Starting Equipment step - adds the kit above plus rolls
// 3d6x10 Silver Pennies.
export function applyStartingKit(pc: UndoRedoStore<ReforgedCharacter>): void {
  const current = get(pc);
  if (current.startingKitApplied || current.characterCreationFinalized) return;

  const items = STARTING_KIT_ITEM_NAMES.map((name) => COMPENDIUM.find((i) => i.name === name)).filter(
    (i): i is CompendiumItem => !!i,
  );
  const roll = parseAndRoll("3d6");
  const sp = roll ? roll.total * 10 : 0;
  pc.set({
    ...current,
    gear: [...current.gear, ...items.map((i) => compendiumItemToGear(i))],
    silverPennies: current.silverPennies + sp,
    startingKitApplied: true,
  });
  if (roll) {
    notify(
      `Starting Equipment (§3.10): added ${STARTING_KIT_ITEM_NAMES.join(", ")}. Rolled 3d6×10 (${roll.breakdown}) × 10 = ${sp} SP.`,
    );
  }
}
