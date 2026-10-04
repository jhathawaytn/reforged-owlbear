// Career data pulled directly from the manuscript (Ch.4). Only the 4
// Careers included in this playtest (§4.13 - "4 of 8 Careers").

export type CareerName = "Blacksmith" | "Hedge Knight" | "Thief" | "Scout";
export const CAREER_NAMES: CareerName[] = ["Blacksmith", "Hedge Knight", "Thief", "Scout"];

// Structured so the sheet can auto-add it to Gear & Attacks, the same way
// gear-shop weapons work.
export type SignatureWeapon = {
  name: string;
  profileLabel: string; // display label, e.g. "Slow (d10)"
  damageDie: string; // "d10"
  damageType: string;
  properties: string; // "-" if none
  special: string; // the Career-specific special quality, full text
};

export type Career = {
  name: CareerName;
  commonKnowledge: string;
  signatureWeapon: SignatureWeapon;
  // Compendium name of a stock granted with the Signature Weapon (rules v0.5
  // Scout: "Starting Ammunition 1 Arrow Quiver (d10, 1 slot)").
  startingAmmunition?: string;
  treeAccess: string[];
  talentAccess: { category: string; talents: string[] }[];
  trinkets: string[];
};

export const CAREERS: Record<CareerName, Career> = {
  Blacksmith: {
    name: "Blacksmith",
    commonKnowledge: "Repair, Appraise, Lift, Endurance",
    signatureWeapon: {
      name: "Heavy Work Hammer",
      profileLabel: "Slow (d10)",
      damageDie: "d10",
      damageType: "Bludgeoning",
      properties: "-",
      special:
        "Self-Made: repairable without tools or a workshop when the fiction permits. Once/session, when it would become Damaged, it stays Healthy instead.",
    },
    treeAccess: ["Blacksmithing", "Armor", "Bashing"],
    talentAccess: [
      { category: "Combat", talents: ["Brutal Blows", "Firm Grip", "Intimidate", "Protect"] },
      { category: "Social", talents: ["Crafty", "Haggler", "Market Access"] },
    ],
    trinkets: [
      "A small hand-forged iron horseshoe pendant.",
      "A piece of ancient charred oak that never leaves soot on your fingers.",
      "A rusted nail with a strangely intricate swirling design.",
      "A jagged fragment of a blackened anvil.",
    ],
  },
  "Hedge Knight": {
    name: "Hedge Knight",
    commonKnowledge: "Heraldry, Horsemanship, Campcraft, Chivalry",
    signatureWeapon: {
      name: "Knight's Longsword",
      profileLabel: "Balanced (d8)",
      damageDie: "d8",
      damageType: "Slashing",
      properties: "-",
      special: "Veteran: once/session, when it would become Broken, it stays Damaged instead.",
    },
    treeAccess: ["Armor", "Riding", "Command"],
    talentAccess: [
      {
        category: "Combat",
        talents: ["Brutal Blows", "Firm Grip", "Mounted Warrior", "Patient Strike", "Protect", "Steadfast"],
      },
      { category: "Exploration", talents: ["Well-Traveled"] },
      { category: "Social", talents: ["Crafty", "Friends in High Places", "Inspiring"] },
    ],
    trinkets: [
      "A faded heraldic pennant from a forgotten lord.",
      "A tarnished silver spur bearing an unfamiliar family crest.",
      "A broken tournament favor tied around your sword belt.",
      "A dented steel gauntlet that once turned aside a killing blow.",
    ],
  },
  Thief: {
    name: "Thief",
    // Hidden Ways (§4.9) covers rooftops, alleys, cellars, drains, sewers,
    // service passages, dungeon routes, crawlspaces, old foundations, and
    // other overlooked paths through built environments.
    commonKnowledge: "Security Measures, Criminal Signs, Guard Routines, Hidden Ways",
    signatureWeapon: {
      name: "Hidden Stiletto",
      profileLabel: "Quick (d6)",
      damageDie: "d6",
      damageType: "Piercing",
      properties: "Concealable",
      special: "Veteran: once/session, when it would become Broken, it stays Damaged instead.",
    },
    treeAccess: ["Detection", "Burglary", "Thievery"],
    talentAccess: [
      { category: "Combat", talents: ["Alert", "Quick Draw", "Snake's Parry"] },
      { category: "Exploration", talents: ["Acrobat", "Skilled Climber"] },
      {
        category: "Tricks & Subterfuge",
        talents: ["Opportunist", "Pocket Change", "Stashcraft", "Subtle", "Surveillance"],
      },
    ],
    trinkets: [
      "A single master skeleton key snapped in half but still warm to the touch.",
      "A small pouch of \"vanishing powder\" - flour and soot - for creating momentary distractions.",
      "A tattered map of a local manor with a single room marked with a crimson X.",
      "A pair of soft-soled slippers that make absolutely no sound on stone floors.",
    ],
  },
  Scout: {
    name: "Scout",
    commonKnowledge: "Trail Signs, Concealed Approaches, Animal Warnings, Field Reconnaissance",
    signatureWeapon: {
      name: "Hunting Bow",
      profileLabel: "Ranged (d8)",
      damageDie: "d8",
      damageType: "Piercing",
      properties: "Requires two hands and open ground; a liability in close quarters",
      special:
        "Maintained: at the start of each session, if this weapon is Damaged, restore it to Healthy. Cannot repair a Broken weapon.",
    },
    startingAmmunition: "Arrow Quiver",
    treeAccess: ["Tracking", "Ambush", "Wilderness Craft"],
    talentAccess: [
      {
        category: "Combat",
        talents: ["Alert", "Covering Fire", "Crippling Shot", "Patient Strike", "Surge", "Throwing Master"],
      },
      { category: "Exploration", talents: ["Animal Handler", "Field Signals", "Skilled Climber"] },
      { category: "Social", talents: ["Animal Attuned"] },
    ],
    trinkets: [
      "A strip of tanned hide marked with a private trail code only you can read.",
      "A hand-drawn map of a region that officially does not exist on any chartered territory.",
      "A folded piece of oilskin containing a pressed leaf from a forest you have never told anyone about.",
      "A small bone whistle that mimics a hawk's cry - your signal to anyone who knows what to listen for.",
    ],
  },
};
