export type Attribute = "STR" | "DEX" | "INT" | "WIL";
export const ATTRIBUTES: Attribute[] = ["STR", "DEX", "INT", "WIL"];

export type Age = "" | "Young Adult" | "Mature" | "Prime" | "Old" | "Very Old";
export const AGES: Age[] = ["", "Young Adult", "Mature", "Prime", "Old", "Very Old"];

// The d6 Age table (§3.3). Starting XP is recorded as XP Earned, not XP
// Available, until the Company's first return to a settlement. The
// Attribute Adjustment is structured (not just display text) so the
// Character Creator can actually apply it - respecting the Attribute
// Maximum of 18 and the Attribute Floor of 6 (Age cannot reduce an
// Attribute below 6; if it's already at or below 6, ignore the penalty
// entirely; the floor never raises a low Attribute up to 6 either).
export const AGE_TABLE: Record<Exclude<Age, "">, { attrDeltas: Partial<Record<Attribute, number>>; careerPicks: number; startingXP: number }> = {
  "Young Adult": { attrDeltas: { DEX: 2, WIL: -1 }, careerPicks: 1, startingXP: 0 },
  Mature: { attrDeltas: { DEX: 1, WIL: -1 }, careerPicks: 1, startingXP: 200 },
  Prime: { attrDeltas: { STR: 1, INT: 1 }, careerPicks: 2, startingXP: 400 },
  Old: { attrDeltas: { DEX: -1, INT: 1 }, careerPicks: 2, startingXP: 700 },
  "Very Old": { attrDeltas: { STR: -1, DEX: -1, WIL: 1 }, careerPicks: 3, startingXP: 1000 },
};
function formatAttrDeltas(deltas: Partial<Record<Attribute, number>>): string {
  return Object.entries(deltas)
    .map(([attr, d]) => `${attr} ${(d ?? 0) >= 0 ? "+" : ""}${d}`)
    .join(", ");
}
export function ageTooltip(age: Age): string {
  if (!age) return "";
  const t = AGE_TABLE[age];
  return `${formatAttrDeltas(t.attrDeltas)} | ${t.careerPicks} Career Pick${t.careerPicks === 1 ? "" : "s"} | ${t.startingXP} Starting XP (§3.3)`;
}

// Applies an Age's Attribute Adjustment to a set of Attributes, respecting
// the 18 ceiling and the 6 floor described above. Returns a new object.
export function applyAgeAttrDeltas(attributes: Record<Attribute, number>, age: Age): Record<Attribute, number> {
  if (!age) return attributes;
  const next = { ...attributes };
  for (const [attr, delta] of Object.entries(AGE_TABLE[age].attrDeltas) as [Attribute, number][]) {
    if (delta > 0) {
      next[attr] = Math.min(18, next[attr] + delta);
    } else if (delta < 0 && next[attr] > 6) {
      next[attr] = Math.max(6, next[attr] + delta);
    }
  }
  return next;
}

// Career Questionnaire (§3.8, Ch.4 per-Career tables) - only the first Career
// selected gets one. Beats 1-3 record which d6 option was rolled/chosen (and
// its "names someone/something" note, if any) plus whether its +1 Attribute
// has been applied. Beat 4 (Breaking Point) grants no Attribute - "detail"
// there records the answer to its hook prompt instead.
export type QuestionnaireAnswer = {
  roll: number; // 1-6, indexes that Beat's options
  detail: string;
  applied: boolean; // Beats 1-3 only
};
export type CareerQuestionnaireState = {
  career: import("./careers").CareerName;
  rerollUsed: boolean; // one reroll total, across the whole Questionnaire (§3.8)
  beat1?: QuestionnaireAnswer;
  beat2?: QuestionnaireAnswer;
  beat3?: QuestionnaireAnswer;
  beat4?: QuestionnaireAnswer;
};

// §3.11/§3.12 - fixed reflection prompts, not rollable. Each character records
// up to 6 free-text answers, positionally paired with these prompt arrays.
export const HAMLET_CONNECTION_PROMPTS: string[] = [
  "Who in the Hamlet knows you well?",
  "Who worries when you leave?",
  "Who do you owe a favor, debt, or obligation?",
  "What responsibility have you left behind?",
  "What place in the Hamlet matters to you?",
  "What would make returning home feel worthwhile?",
];
// The 6th is the book's own trailing optional consideration, not one of its
// 5 numbered "Consider" bullets - a personal connection to another specific
// PC, only relevant if you already know who else is joining the table.
export const COMPANY_CONNECTION_PROMPTS: string[] = [
  "Why would you choose to travel with others rather than face danger alone?",
  "What do you hope a Company can give you that you could not find on your own?",
  "What do you fear about relying on others?",
  "What would you refuse to do, even for people you trust?",
  "What would make you walk away from a Company?",
  "If you already know who else is joining your table, what personal connection (shared history, a debt, a prior meeting) predates the Company for you and one of them?",
];

// Sentence templates so a filled-in answer reads as prose in the Background
// Summary instead of a bare list of answers - one clause per prompt, in the
// same order, meant to be read together.
export const HAMLET_CONNECTION_TEMPLATES: ((answer: string) => string)[] = [
  (a) => `${a} knows me in the Hamlet very well.`,
  (a) => `When I'm away, ${a} worries about my safe return.`,
  (a) => `I owe ${a} a favor, debt, or obligation.`,
  (a) => `I left behind ${a}.`,
  (a) => `${a} matters to me in the Hamlet.`,
  (a) => `${a} would make returning home feel worthwhile.`,
];
export const COMPANY_CONNECTION_TEMPLATES: ((answer: string) => string)[] = [
  (a) => `I travel with others rather than face danger alone because ${a}.`,
  (a) => `I hope a Company can give me ${a}, which I could not find on my own.`,
  (a) => `What I fear about relying on others is ${a}.`,
  (a) => `I would refuse to ${a}, even for people I trust.`,
  (a) => `${a} would make me walk away from a Company.`,
  (a) => `Before the Company formed, ${a}.`,
];

// Exactly 4 fixed Ancestries in the manuscript (§3.6) - not an open list.
// Heritage (Dwarf, Halfling, Elf, etc.) stays free text since the book
// explicitly says that part is open-ended ("or another heritage you and
// the GM establish").
export type Ancestry = "" | "Tough" | "Arcane" | "Cunning" | "Adaptable";
export const ANCESTRIES: Ancestry[] = ["", "Tough", "Arcane", "Cunning", "Adaptable"];
export const ANCESTRY_BENEFIT: Record<Exclude<Ancestry, "">, string> = {
  Tough: "Earth-Kin. Once/session, when reduced to 0 HP, choose to go to 1 HP instead.",
  Arcane: "Fey-Kin. Establish one minor magical feat; invoke it once/session.",
  Cunning: "Small-Kin. Once/session, reroll a failed Save and take the second result.",
  Adaptable: "Common-Kin. Once/session, substitute a different Attribute for a called-for Save.",
};

// A manually-defined attack/technique. Reforged's exact to-hit math isn't
// baked in here on purpose - "roll" is whatever dice notation the player
// writes (e.g. "d6+2"), always at the weapon's native (Healthy) die - the
// Roll button computes the Condition-adjusted die at roll time instead of
// editing this field. gearId links back to the GearItem this came from
// (set automatically when bought from the Gear shop) so Condition and the
// weapon's Stress option can be read live; freeform/homebrew Attacks with
// no matching GearItem leave it unset and behave exactly as before.
export type Attack = {
  id: string;
  name: string;
  roll: string;
  notes: string;
  gearId?: string;
};

// Weapon Condition (§9.4.2): Damaged steps the native die down one size;
// Broken has no normal damage. Profile (hands/slots) and any flat modifier
// in the notation are unaffected - only the die faces change.
export const WEAPON_DIE_STEP: Record<string, string> = { d10: "d8", d8: "d6", d6: "d4" };
export function stepWeaponDie(notation: string): string {
  const m = notation.match(/d(\d+)/i);
  if (!m) return notation;
  const stepped = WEAPON_DIE_STEP[`d${m[1]}`];
  return stepped ? notation.replace(/d\d+/i, stepped) : notation;
}

// Inventory zones (Ch.9): Hand and Handy each cap at 2, Worn caps at
// floor(STR/2), Backpack takes whatever capacity remains up to total STR.
// These are soft caps shown on the sheet, not hard-enforced.
export type GearZone = "Hand" | "Handy" | "Worn" | "Backpack";
export const GEAR_ZONES: GearZone[] = ["Hand", "Handy", "Worn", "Backpack"];

// Coin Burden (§9.1.5): each denomination is tracked independently, never
// combined into one total value first. At or below the free threshold, a
// denomination occupies 0 slots; above it, burden is ceil(full quantity /
// coins-per-slot) - not the quantity minus the threshold.
export type CoinDenomination = "farthings" | "silverPennies" | "goldPieces" | "goldCrowns";
export const COIN_BURDEN: Record<CoinDenomination, { freeThreshold: number; coinsPerSlot: number }> = {
  farthings: { freeThreshold: 1000, coinsPerSlot: 2000 },
  silverPennies: { freeThreshold: 250, coinsPerSlot: 500 },
  goldPieces: { freeThreshold: 25, coinsPerSlot: 100 },
  goldCrowns: { freeThreshold: 1, coinsPerSlot: 25 },
};
export function coinBurdenSlots(coins: Record<CoinDenomination, number>): number {
  let total = 0;
  for (const denom of Object.keys(COIN_BURDEN) as CoinDenomination[]) {
    const qty = coins[denom];
    const { freeThreshold, coinsPerSlot } = COIN_BURDEN[denom];
    if (qty > freeThreshold) total += Math.ceil(qty / coinsPerSlot);
  }
  return total;
}

// Usage Dice (§9.3.4): a consumable stock whose exact remaining quantity is
// abstracted as a die. Roll it; on 1-3 it steps down one size; a d4 that
// steps down is depleted. Depletion doesn't undo the use that caused it.
export type DieSize = "d4" | "d6" | "d8" | "d10" | "d12";
export const USAGE_DIE_SEQUENCE: DieSize[] = ["d12", "d10", "d8", "d6", "d4"];
export const DIE_SIDES: Record<DieSize, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12 };
export type UsageDieState = DieSize | "depleted";

export function stepDownDie(size: DieSize): UsageDieState {
  const idx = USAGE_DIE_SEQUENCE.indexOf(size);
  if (idx === USAGE_DIE_SEQUENCE.length - 1) return "depleted";
  return USAGE_DIE_SEQUENCE[idx + 1];
}

// What kind of consumable resource a Usage Die tracks. "Water" is singled
// out because Catch Your Breath (§14.1) specifically needs an accessible
// Water stock.
export type UsageKind = "Water" | "Rations" | "Ammunition" | "Fuel" | "Fodder" | "Medical" | "Repair";

// Whether an item keeps occupying its slot once its Usage Die depletes.
// Container-based resources (Waterskin, Physicker's Kit, Repair Kit) keep
// their slot - the container is still there, just empty, until restocked.
// Pure consumables (Rations, a Torch Bundle, Lamp Oil, Fodder, Ammunition)
// have nothing left to carry once used up. Not stated explicitly in the
// manuscript as a rule - a reasonable reading of what each item actually is.
const KEEPS_SLOT_WHEN_DEPLETED: UsageKind[] = ["Water", "Medical", "Repair"];
export function occupiesSlotWhenDepleted(kind: UsageKind | undefined): boolean {
  return kind === undefined || KEEPS_SLOT_WHEN_DEPLETED.includes(kind);
}

// Equipment Quality & Condition (§9.3). Only tracked for durable Weapon/
// Armor items - "durable equipment" in the rules' sense; consumables use
// Usage Dice instead. Degradation is never automatic ("routine competent
// use does not randomly degrade equipment") - it's a manual record of
// events the fiction/rules trigger (Sunder, Deflect, weapon Stress, etc.).
export type Quality = "Shoddy" | "Standard" | "Masterwork";
export const QUALITIES: Quality[] = ["Shoddy", "Standard", "Masterwork"];

export type Condition = "Healthy" | "Damaged" | "Broken" | "Destroyed";
export const CONDITION_ORDER: Condition[] = ["Healthy", "Damaged", "Broken", "Destroyed"];
export const CONDITION_COLOR_CLASS: Record<Condition, string> = {
  Healthy: "text-green-700",
  Damaged: "text-yellow-700",
  Broken: "text-orange-700",
  Destroyed: "text-red-700 line-through",
};

export type DurableCategory = "Weapon" | "Armor";

export type GearItem = {
  id: string;
  name: string;
  zone: GearZone;
  slots: number; // 0 = Petty
  equipped: boolean;
  armorValue?: number; // set when this item is Armor (e.g. "A1" -> 1); equipped armor sums into total Armor
  usageKind?: UsageKind;
  usageDie?: UsageDieState; // current size; absent = not a Usage Die item
  usageDieMax?: DieSize; // starting size, for restocking
  durableCategory?: DurableCategory; // set for Weapon/Armor items - shows Quality/Condition controls
  quality?: Quality;
  condition?: Condition;
  masterworkReserveSpent?: boolean; // Masterwork only - the free "stays Healthy" absorb, spent once
  // Structured Armor properties that affect damage-intake math (Deflective,
  // Edge-Proof, Shield Sacrifice, Helm Sacrifice - §9.5.4-9.5.5). Sourced
  // from the compendium entry, not user-editable. `notes` stays the display
  // text - property wording there isn't stable enough to keyword-match.
  properties?: string[];
  // A weapon's one Special Stress Property (§9.4.6 - Brutal, Cleaving,
  // Vicious, Precise, Guarding), for the same reason: sourced from the
  // compendium entry, kept separate from the free-text notes.
  specialStress?: string;
  notes: string;
};

export function hasArmorProperty(item: GearItem, property: string): boolean {
  return (
    item.equipped &&
    !!item.properties?.includes(property) &&
    item.condition !== "Broken" &&
    item.condition !== "Destroyed"
  );
}

// Advance one degradation step, respecting Quality (§9.3.1):
// Shoddy -> Destroyed immediately; Masterwork's first hit spends its
// Reserve and stays Healthy, then follows the Standard track.
export function degradeCondition(item: GearItem): void {
  if (!item.condition) return;
  if (item.quality === "Shoddy") {
    item.condition = "Destroyed";
    return;
  }
  if (item.quality === "Masterwork" && item.condition === "Healthy" && !item.masterworkReserveSpent) {
    item.masterworkReserveSpent = true;
    return;
  }
  const idx = CONDITION_ORDER.indexOf(item.condition);
  if (idx < CONDITION_ORDER.length - 1) item.condition = CONDITION_ORDER[idx + 1];
}

// Step back up one Condition. Destroyed is irreparable (§9.3.3) except by
// an extraordinary rule this sheet doesn't model, so it's excluded.
export function repairCondition(item: GearItem): void {
  if (!item.condition || item.condition === "Destroyed") return;
  const idx = CONDITION_ORDER.indexOf(item.condition);
  if (idx > 0) item.condition = CONDITION_ORDER[idx - 1];
}

// Character Level table (§7.3) - Level is determined by XP Earned. Meeting a
// threshold doesn't grant the Level "in the field": the book also requires
// returning to a settlement, resolving HP/Attribute Growth, and caps normal
// advancement at 1 Level per session - none of that is tracked here, so this
// always shows the Level XP Earned currently qualifies for.
export const LEVEL_TABLE: { level: number; title: string; xpEarned: number }[] = [
  { level: 1, title: "Novice", xpEarned: 0 },
  { level: 2, title: "Proven", xpEarned: 1500 },
  { level: 3, title: "Expert", xpEarned: 3000 },
  { level: 4, title: "Veteran", xpEarned: 6000 },
  { level: 5, title: "Elite", xpEarned: 12000 },
  { level: 6, title: "Master", xpEarned: 24000 },
  { level: 7, title: "Command", xpEarned: 48000 },
  { level: 8, title: "Hero", xpEarned: 100000 },
  { level: 9, title: "Lord", xpEarned: 200000 },
  { level: 10, title: "Visionary", xpEarned: 400000 },
];
export function levelForXP(xpEarned: number): { level: number; title: string } {
  let result = LEVEL_TABLE[0];
  for (const row of LEVEL_TABLE) {
    if (xpEarned >= row.xpEarned) result = row;
  }
  return { level: result.level, title: result.title };
}
export function titleForLevel(level: number): string {
  return LEVEL_TABLE.find((row) => row.level === level)?.title ?? "";
}

// Growth When You Gain a Level (§7.5): HP Growth is a flat 1d6 to max (and
// current, capped at the new max). Attribute Growth rolls 3d6 once per
// Attribute against its "unreduced maximum" - current maximum plus anything
// currently removed by an unresolved Permanent Injury - i.e. `attributeMax`,
// never the Permanent-Injury-reduced `attributes` value. Callers pass
// `pc.attributeMax[a]`, not `pc.attributes[a]`.
export function attributeGrows(roll3d6: number, unreducedMax: number): boolean {
  return unreducedMax < 18 && roll3d6 > unreducedMax;
}

// If no Attribute grows naturally, one Attribute tied for the lowest
// unreduced maximum grows instead (§7.5) - unless every Attribute is already
// at 18. Pass `pc.attributeMax`, matching `attributeGrows` above.
export function lowestAttributes(attributes: Record<Attribute, number>): Attribute[] {
  const min = Math.min(...ATTRIBUTES.map((a) => attributes[a]));
  return ATTRIBUTES.filter((a) => attributes[a] === min);
}

// Technique capacity by Level (Ch.13, §13.6.1).
export const TECHNIQUE_CAPACITY_BY_LEVEL: [max: number, capacity: number][] = [
  [2, 1],
  [4, 2],
  [7, 3],
  [10, 4],
];
export function techniqueCapacityForLevel(level: number): number {
  for (const [max, capacity] of TECHNIQUE_CAPACITY_BY_LEVEL) {
    if (level <= max) return capacity;
  }
  return 4;
}

// Combat lifecycle (§13.0-§13.4): Initiative (once) -> Clash (once) -> Fray
// (repeats in rounds until combat ends).
export type CombatStage = "Initiative" | "Clash" | "Fray";
export const COMBAT_STAGES: CombatStage[] = ["Initiative", "Clash", "Fray"];

// Techniques (§13.6) - every Reforged knows all of them; Level only caps how
// many may be used in a single combat. Every Technique also has an
// unstated-but-explicit "used at most once per Initiative/Clash/Fray round"
// limit (§13.6.1), tracked separately from the per-combat capacity.
export type TechniqueName =
  | "Take the Initiative"
  | "Act Decisively"
  | "Defensive Maneuvering"
  | "Tactical Consideration"
  | "Seize the Advantage"
  | "Save Your Energy"
  | "Hold Fast"
  | "Press the Advantage"
  | "Desperate Effort";

export const TECHNIQUES: { name: TechniqueName; stage: CombatStage; opportunity: string; effect: string }[] = [
  {
    name: "Take the Initiative",
    stage: "Initiative",
    opportunity: "Immediately after failing your Initiative Save.",
    effect: "Treat the failed Save as a success. You gain an Initiative Action as normal.",
  },
  {
    name: "Act Decisively",
    stage: "Initiative",
    opportunity: "Before rolling weapon damage during your Initiative Action.",
    effect: "Increase your weapon's damage die by one step (d4→d6→d8→d10→d12) and roll the stepped die normally.",
  },
  {
    name: "Defensive Maneuvering",
    stage: "Clash",
    opportunity: "When choosing an eligible Block, Dodge, Parry, or Fight Back.",
    effect: "Reduce that Reaction's Strain cost by 1, to a minimum of 0.",
  },
  {
    name: "Tactical Consideration",
    stage: "Clash",
    opportunity: "After rolling one of your own dice during the Clash, but before the result is resolved.",
    effect: "Reroll that die. You must keep the second result.",
  },
  {
    name: "Seize the Advantage",
    stage: "Clash",
    opportunity: "Immediately after resolving your Action.",
    effect:
      "Reposition yourself or one willing adjacent ally a short distance without spending another Action. Cannot be used to make another attack or ignore obstacles that would normally prevent movement.",
  },
  {
    name: "Save Your Energy",
    stage: "Fray",
    opportunity: "At the start of your Fray Turn.",
    effect: "This turn, you may both move and take one Action even while Engaged.",
  },
  {
    name: "Hold Fast",
    stage: "Fray",
    opportunity: "After Armor and Deflect have been resolved, but before damage is applied.",
    effect: "Reduce the remaining damage by 3, to a minimum of 0.",
  },
  {
    name: "Press the Advantage",
    stage: "Fray",
    opportunity: "Immediately after damaging an enemy during the Fray.",
    effect:
      "Choose one: the enemy gives ground and leaves Engagement with you; the enemy drops one held item; the enemy suffers 2 additional damage after Armor.",
  },
  {
    name: "Desperate Effort",
    stage: "Fray",
    opportunity: "At the start of your Fray Turn.",
    effect:
      "Take two different Actions during this turn. After both Actions resolve, gain 2 Strain. Cannot be used to make two separate melee/ranged Actions unless another rule specifically allows it.",
  },
];

// Act Decisively steps a weapon's die UP one size - the reverse ladder from
// Weapon Condition's stepWeaponDie (§9.4.2 only ever steps down); this one
// only applies for the one Initiative Action it's used on, never persisted
// to the weapon itself.
export const WEAPON_DIE_STEP_UP: Record<string, string> = { d4: "d6", d6: "d8", d8: "d10", d10: "d12" };
export function stepWeaponDieUp(notation: string): string {
  const m = notation.match(/d(\d+)/i);
  if (!m) return notation;
  const stepped = WEAPON_DIE_STEP_UP[`d${m[1]}`];
  return stepped ? notation.replace(/d\d+/i, stepped) : notation;
}

export type ReforgedCharacter = {
  // identity
  name: string;
  playerName: string;
  ancestry: Ancestry;
  heritage: string;
  languages: string;
  age: Age;
  definingTrait: string;
  formativeExperience: string;
  arcaneFeat: string; // Arcane Ancestry only (§3.6) - the established minor magical feat

  // §3.11/§3.12 - free-text answers, positionally paired with
  // HAMLET_CONNECTION_PROMPTS / COMPANY_CONNECTION_PROMPTS
  hamletConnection: string[];
  companyConnection: string[];

  // When set, the Background box shows this instead of the auto-generated
  // narrative - lets minor manual touch-ups stick instead of always being
  // recomputed from the Questionnaire/Connection answers.
  backgroundOverride: string;

  // Character Creator one-time-action locks (Ch.3) - persisted so they stay
  // locked across closing/reopening the wizard, not just within one session
  // of it being open. characterCreationFinalized additionally lifts the
  // Career Pick "free" cap below, for Advancement after play begins.
  attributesRolled: boolean;
  attributeSwapUsed: boolean;
  hpRolled: boolean;
  definingTraitRolled: boolean;
  definingTraitRerollUsed: boolean;
  formativeExperienceApplied: boolean;
  ageAdjustmentApplied: boolean;
  startingKitApplied: boolean;
  startingXPApplied: number; // the Age Starting XP currently baked into xpEarned, so changing Age can back it out
  characterCreationFinalized: boolean;

  // §4.2 - each distinct Career selected grants one Trinket (Petty, no
  // mechanical effect). One entry per Career once rolled/recorded.
  trinkets: { career: import("./careers").CareerName; text: string }[];

  // careers & advancement
  careers: import("./careers").CareerName[]; // multiple Careers are allowed (§4.1)
  level: number;
  xpEarned: number;
  xpAvailable: number;
  questionnaire?: CareerQuestionnaireState; // §3.8 - only the first Career gets one

  // attributes (roll-under d20 Saves against these scores)
  attributes: Record<Attribute, number>;

  // The "unreduced maximum" Attribute Growth checks against (§7.5): kept in
  // lockstep with `attributes` through every Character Creation increase
  // (roll, swap, Age, Formative Experience, Questionnaire) and by Growth
  // itself, but NOT by a Permanent Injury - applying one lowers `attributes`
  // directly while this stays put, so Growth still checks against the true
  // pre-Injury ceiling per §7.5.
  attributeMax: Record<Attribute, number>;

  // resources
  hitPoints: number;
  maxHitPoints: number;
  strain: number; // accumulates during a fight, 1 Inventory Slot each, clears after

  // Combat lifecycle & Techniques (§13.0-§13.6). Stage gates which
  // Techniques are usable; techniqueUsedThisStageInstance resets on every
  // stage advance (including each new Fray round), since at most one
  // Technique may be used per Initiative/Clash/Fray-round.
  // techniquesUsedNames both enforces "each Technique once per combat" and
  // gives the overall per-combat count (vs. techniqueCapacityForLevel).
  combatActive: boolean;
  combatStage: CombatStage | null;
  frayRound: number;
  techniquesUsedNames: TechniqueName[];
  techniqueUsedThisStageInstance: boolean;
  // Gear ids of ammunition stocks fired from during the current combat;
  // each gets one Usage roll at End Combat (§9.4.8). See ammunition.ts.
  ammoUsedThisCombat: string[];

  // combat
  attacks: Attack[];

  // skills & talents
  skillTreeNodes: { tree: import("./skillTrees").SkillTreeName; node: import("./skillTrees").SkillNodeId; free: boolean }[];
  talentsOwned: { category: string; name: string; free: boolean }[];
  skillsAndTalents: string; // freeform overflow - homebrew Talents, notes, anything not in the picker
  hooks: string;
  notes: string;

  // wealth (four denominations per Ch.9 - Farthing/Silver Penny/Gold
  // Piece/Gold Crown; coin burden is computed - see coinBurdenSlots)
  farthings: number;
  silverPennies: number;
  goldPieces: number;
  goldCrowns: number;

  // gear - total capacity is derived from STR, not stored
  gear: GearItem[];

  // active status Conditions (Appendix A) - just tracked, not enforced
  conditions: ConditionId[];

  // Fatigue & Injury zone (§9.1.2, §14.4, §14.9) - always counts against
  // STR capacity, never part of the Backpack, never dropped with it.
  fatigue: number; // 1 slot each; cleared only by Normal/Comfortable Rest
  deprivationCauses: string[]; // tracked causes sustaining Deprived (Food, Water, Rest, Manual, etc.)
  injuries: Injury[]; // 1 slot each
  backpackDropped: boolean; // Backpack-zone items stop counting while dropped

  // Damage intake (§13.10, §14.1-14.6) - state that has to persist between
  // hits, not just live inside one Take Damage modal session.
  mortalWound: boolean; // §14.5 - a second qualifying hit before stabilization is instant death
  armorWear: boolean; // Iron Discipline's shared Armor Wear box (§9.5.7) - manually cleared at session end
  doomActive: boolean; // Scar 11 - manually cleared like Armor Wear; a Mortal Wound while active cannot be stabilized
  temperedPending: boolean; // Scar 12 - consumed on the next Level gained (not wired up yet, just recorded)
  impairedNextAction: boolean; // Scar 4 - manually cleared once the character's next Action has happened
  scars: Scar[];
};

export type Scar = { id: string; roll: number; name: string; note: string };

// The Scar table (§14.2) - rolled on the die that caused the hit when it
// empties HP to exactly 0 with no overflow into STR. Attribute loss listed
// here is NOT Damage (§14.2's "Damage and Attribute Loss are not the same
// thing"): it never triggers a Critical Save, a Mortal Wound, or another
// Scar - only reaching STR 0 still resolves as Slain (§14.6).
export const SCAR_TABLE: { roll: number; name: string; effect: string }[] = [
  { roll: 1, name: "Distress", effect: "Lose d6 WIL." },
  { roll: 2, name: "Disfigurement", effect: "Lose 1 WIL and gain a permanent visible mark appropriate to the blow." },
  { roll: 3, name: "Smash", effect: "Lose d4 STR." },
  { roll: 4, name: "Stunned", effect: "Gain 1 Fatigue; your next Action is Impaired." },
  { roll: 5, name: "Rupture", effect: "Lose d6 STR." },
  { roll: 6, name: "Gouge", effect: "Roll on the Injury Site Table and suffer a Light Injury there." },
  { roll: 7, name: "Concussion", effect: "Suffer a Severe Head Injury." },
  { roll: 8, name: "Tear", effect: "Roll on the Injury Site Table and suffer a Severe Injury there." },
  { roll: 9, name: "Agony", effect: "Lose d4 STR and d4 WIL." },
  { roll: 10, name: "Mutilation", effect: "Roll on the Injury Site Table and suffer a Permanent Injury there." },
  { roll: 11, name: "Doom", effect: "If you suffer a Mortal Wound later this session, you cannot be stabilized." },
  {
    roll: 12,
    name: "Tempered",
    effect: "Record the Scar. The next time you gain a Level, roll HP Growth twice and keep the higher result, then remove this benefit.",
  },
];

// A die too small to reach a result simply can't roll it - rollDieSides
// already guarantees that, so no separate capping is needed here.
export function rollScar(sides: number, rollFn: (sides: number) => number): { roll: number; entry: (typeof SCAR_TABLE)[number] } {
  const roll = rollFn(sides);
  return { roll, entry: SCAR_TABLE[roll - 1] };
}

// The Injury Site Table (§14.4) - d10, used for any Light/Severe/Permanent
// Injury alike. The "site" column is flavor only; "location" is the
// Mechanical Location that actually drives severity effects and Permanent
// Attribute-maximum loss.
export const INJURY_SITE_TABLE: { roll: number; site: string; location: InjuryLocation }[] = [
  { roll: 1, site: "Foot / Ankle", location: "Leg" },
  { roll: 2, site: "Knee / Leg", location: "Leg" },
  { roll: 3, site: "Ribs / Chest", location: "Torso" },
  { roll: 4, site: "Back / Torso", location: "Torso" },
  { roll: 5, site: "Off-hand Shoulder / Arm", location: "Off-hand" },
  { roll: 6, site: "Off-hand Hand / Wrist", location: "Off-hand" },
  { roll: 7, site: "Sword Arm / Shoulder", location: "Sword Arm" },
  { roll: 8, site: "Sword Hand / Wrist", location: "Sword Arm" },
  { roll: 9, site: "Internal / Abdomen", location: "Internal" },
  { roll: 10, site: "Head / Face / Eye", location: "Head" },
];

export function rollInjurySite(rollFn: (sides: number) => number): (typeof INJURY_SITE_TABLE)[number] {
  return INJURY_SITE_TABLE[rollFn(10) - 1];
}

// Ordinary physical weapon damage types (§9.4.3). "Other" covers
// supernatural/environmental damage that isn't one of the three - Edge-Proof
// only ever applies to Slashing or Piercing.
export type DamageType = "Slashing" | "Piercing" | "Bludgeoning" | "Other";
export const DAMAGE_TYPES: DamageType[] = ["Slashing", "Piercing", "Bludgeoning", "Other"];

export type InjurySeverity = "Light" | "Severe" | "Permanent";
export const INJURY_SEVERITIES: InjurySeverity[] = ["Light", "Severe", "Permanent"];
export type InjuryLocation = "Leg" | "Torso" | "Off-hand" | "Sword Arm" | "Internal" | "Head";
export const INJURY_LOCATIONS: InjuryLocation[] = ["Leg", "Torso", "Off-hand", "Sword Arm", "Internal", "Head"];

// headAttribute: Permanent Head Injuries only - "the GM determines whether
// INT or WIL is affected based on the nature of the injury" (§14.4), so it
// isn't fixed like every other location and needs its own per-injury choice.
// applied: whether this Permanent Injury's Attribute (and, for Torso, max
// HP) reduction has already been applied - a one-time action, not derived,
// so removing/editing the row afterward never silently re-applies or
// reverses it (mirrors the Questionnaire beats' own `applied` flag).
export type Injury = {
  id: string;
  severity: InjurySeverity;
  location: InjuryLocation;
  notes: string;
  headAttribute?: "INT" | "WIL";
  applied?: boolean;
};

// Severe Injury by Location table (§14.4).
export const SEVERE_INJURY_EFFECT: Record<InjuryLocation, string> = {
  Leg: "Movement halved; cannot run or charge.",
  Torso: "Cannot use Slow weapons; active Defensive Reactions cost +1 Strain.",
  "Off-hand": "Cannot grip or hold items; two-handed weapon requires a STR Save each turn.",
  "Sword Arm": "Attacks are Impaired.",
  Internal: "Deprived regardless of food and water until professionally treated.",
  Head: "Disadvantage on INT and WIL Saves.",
};

// Permanent Injury by Location table (§14.4) - which Attribute maximum it
// lowers by 1, plus the (non-Attribute) lasting consequence as flavor/rules
// text. Head is the only location without a fixed Attribute - see
// `Injury.headAttribute`. The book states no floor on how low this can go.
export const PERMANENT_INJURY_ATTRIBUTE: Partial<Record<InjuryLocation, Attribute>> = {
  Leg: "DEX",
  "Off-hand": "DEX",
  "Sword Arm": "STR",
  Torso: "STR",
  Internal: "STR",
};
export const PERMANENT_INJURY_CONSEQUENCE: Record<InjuryLocation, string> = {
  Leg: "Movement permanently reduced by one-quarter.",
  "Off-hand": "Hand permanently loses fine manipulation.",
  "Sword Arm": "Two-handed attacks permanently Impaired.",
  Torso: "Maximum HP -1.",
  Internal: "Disadvantage on first disease/poison Save each expedition.",
  Head: "Lasting sensory, speech, memory, or behavioral impairment (GM's call, fictional).",
};

export const INJURY_HEALING: Record<InjurySeverity, string> = {
  Light: "No separate penalty. Heals with appropriate herbs or supplies and a full night's rest (Healing R1 treats in the field).",
  Severe: "Heals with one week of safe recovery under professional medical care (Healing R2 Field Surgery halves it).",
  Permanent: "Permanently occupies its slot. Only high-rank Healing can address it.",
};

export function injuryTooltip(i: Injury): string {
  if (i.severity === "Permanent") {
    const attr = i.location === "Head" ? i.headAttribute : PERMANENT_INJURY_ATTRIBUTE[i.location];
    const attrText = attr ? `${attr} maximum -1. ` : "";
    return `Permanent ${i.location} Injury. ${attrText}${PERMANENT_INJURY_CONSEQUENCE[i.location]} ${INJURY_HEALING.Permanent}`;
  }
  const effect = i.severity === "Light" ? "" : `${SEVERE_INJURY_EFFECT[i.location]} `;
  return `${i.severity} ${i.location} Injury. ${effect}${INJURY_HEALING[i.severity]}`;
}

// Appendix A - Conditions Reference. This tracker just lets you mark which
// are currently active; it doesn't enforce any effect automatically, same
// philosophy as the rest of the sheet. Overburdened isn't in this list
// because it's already computed live from Inventory (see GearView) rather
// than manually toggled. Dazed is ability-granted (e.g. Bashing R2B -
// Concussive) rather than a core Appendix A condition, flagged as such.
export type ConditionId =
  | "Bleeding" | "Blinded" | "Clinging" | "Deafened" | "Deprived"
  | "Entangled" | "Prone" | "Rattled" | "Stunned" | "Dazed";

export const CONDITIONS: { id: ConditionId; effect: string; core: boolean }[] = [
  { id: "Bleeding", core: true, effect: "Cannot restore HP nonmagically until bound (bandages, dressings, or Medical Supplies). Doesn't end merely because combat ends." },
  { id: "Blinded", core: true, effect: "Cannot see - sight-dependent abilities, procedures, perception, and targeting don't function. Other senses work normally." },
  { id: "Clinging", core: true, effect: "Stabilized from Mortally Wounded: unconscious, off the STR track, cannot Catch Your Breath or recover normally. Any damage from any source kills you immediately." },
  { id: "Deafened", core: true, effect: "Cannot hear - hearing-dependent abilities/procedures don't function. Doesn't by itself block speech, movement, or sight." },
  { id: "Deprived", core: true, effect: "Lacking a crucial need (food/water/Rest). Cannot restore HP or Attributes nonmagically until the unmet need is satisfied. 1+ full day Deprived = 1 Fatigue per extra day." },
  { id: "Entangled", core: true, effect: "Movement physically restrained - cannot move or Dodge. Ends via a STR Save, spending 1 Action to cut/pull free, or an ally spending their Action to free you." },
  { id: "Prone", core: true, effect: "Knocked down or dropped. Positional - not automatically Enhanced/Impaired. Can only crawl a short distance while down; standing uses your Move." },
  { id: "Rattled", core: true, effect: "Lose your Reaction, and your next Action is Impaired. Ends after that Action resolves, or at the start of your next turn if you take no Action." },
  { id: "Stunned", core: true, effect: "Cannot take an Action until the end of your next turn (may still move at half speed). Damaging Actions against you are Enhanced." },
  { id: "Dazed", core: false, effect: "Ability-granted (e.g. Bashing R2B - Concussive), not a core Appendix A condition. INT and WIL Saves at Disadvantage until you Rest." },
];
