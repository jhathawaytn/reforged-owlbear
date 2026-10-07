// Mortal Wound → Stabilize → Clinging → exit (§14.5–14.7, V-011). Pure
// state changes on the character; the GM-only buttons and the broadcast to
// the player's own sheet live in services/LifeActions.ts.

import type { ReforgedCharacter } from "./types";

export type LifeState = "alive" | "mortallyWounded" | "clinging" | "dead";

export function lifeStateOf(pc: ReforgedCharacter): LifeState {
  if (pc.dead) return "dead";
  if (pc.conditions.includes("Clinging")) return "clinging";
  if (pc.mortalWound) return "mortallyWounded";
  return "alive";
}

export type LifeAction = "stabilize" | "potion" | "professional" | "override" | "dead" | "revive";

export const LIFE_ACTION_LABEL: Record<LifeAction, string> = {
  stabilize: "Stabilized",
  potion: "Healing Potion",
  professional: "Professional recovery",
  override: "GM override: end Clinging",
  dead: "Mark dead",
  revive: "Undo death",
};

export type LifeActionResult = { pc: ReforgedCharacter; message: string } | { error: string };

function withoutClinging(pc: ReforgedCharacter): ReforgedCharacter["conditions"] {
  return pc.conditions.filter((c) => c !== "Clinging");
}

export function applyLifeAction(pc: ReforgedCharacter, action: LifeAction): LifeActionResult {
  const state = lifeStateOf(pc);
  const name = pc.name || "The character";
  switch (action) {
    // §14.7: a successful Stabilize (or Healing R1) → Clinging.
    case "stabilize":
      if (state !== "mortallyWounded") return { error: `${name} isn't Mortally Wounded.` };
      return {
        pc: { ...pc, mortalWound: false, conditions: [...withoutClinging(pc), "Clinging"] },
        message: `${name} is stabilized and now Clinging. Any damage kills.`,
      };
    // Exiting Clinging: potion → all HP, STR to half max (rounded down).
    case "potion": {
      if (state !== "clinging") return { error: `${name} isn't Clinging.` };
      const str = Math.max(1, Math.floor(pc.attributeMax.STR / 2));
      return {
        pc: {
          ...pc,
          conditions: withoutClinging(pc),
          hitPoints: pc.maxHitPoints,
          attributes: { ...pc.attributes, STR: str },
        },
        message: `${name} drinks a Healing Potion: out of Clinging, HP ${pc.maxHitPoints}, STR ${str}.`,
      };
    }
    // One full week of professional settlement treatment → STR 1.
    case "professional":
      if (state !== "clinging") return { error: `${name} isn't Clinging.` };
      return {
        pc: { ...pc, conditions: withoutClinging(pc), attributes: { ...pc.attributes, STR: 1 } },
        message: `${name} recovers after a week of professional care: out of Clinging at STR 1.`,
      };
    // Trauma Surgeon or anything else: the GM sets the numbers by hand.
    case "override":
      if (state !== "clinging") return { error: `${name} isn't Clinging.` };
      return {
        pc: { ...pc, conditions: withoutClinging(pc) },
        message: `${name} is out of Clinging (GM). Set STR and HP by hand.`,
      };
    case "dead":
      return { pc: markDead(pc), message: `${name} is dead.` };
    case "revive":
      if (state !== "dead") return { error: `${name} isn't dead.` };
      return { pc: { ...pc, dead: false }, message: `${name}'s death was undone (GM). Check STR, HP and wounds.` };
  }
}

export function markDead(pc: ReforgedCharacter): ReforgedCharacter {
  return { ...pc, dead: true, mortalWound: false, conditions: withoutClinging(pc) };
}
