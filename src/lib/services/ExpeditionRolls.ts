import OBR from "@owlbear-rodeo/sdk";
import { get, writable } from "svelte/store";
import { PlayerCharacterStore } from "../model/ReforgedCharacter";
import { rollDiceValues, rollReforgedSave, rollSingleDie } from "./DicePlus";
import { showPopover } from "./Notifier";
import type { Attribute, ReforgedCharacter } from "../types";
import type { SaveRollMode, SaveRollResult } from "../utils";

const REQUEST_KEY = "rodeo.owlbear.reforged-sheet/expedition-roll-request";
const RESULT_KEY = "rodeo.owlbear.reforged-sheet/expedition-roll-result";

export type ExpeditionRollKind =
  | "Trailblaze"
  | "Keep Watch"
  | "Forage for Food"
  | "Forage for Water"
  | "Hunt"
  | "Fish"
  | "Make Camp"
  | "Forced March";

export type ExpeditionAttributeMode = "INT" | "STR" | "HIGHER_INT_DEX" | "INT_OR_STR";
export type ExpeditionSkill = "Wilderness Craft" | "Detection";

export type TrailblazeBoonBane = {
  type: "Boon" | "Bane";
  code: string;
  theme: string;
  effect: string;
};

export type ExpeditionRollRequest = {
  requestId: string;
  targetPlayerId: string;
  kind: ExpeditionRollKind;
  attributeMode: ExpeditionAttributeMode;
  baseModifier: number;
  skill?: ExpeditionSkill;
  untrainedDisadvantage: boolean;
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  applyFailureFatigue: boolean;
  requestedBy: string;
  note?: string;
};

export type ExpeditionRollResponse = {
  requestId: string;
  targetPlayerId: string;
  kind: ExpeditionRollKind;
  status: "rolled" | "declined";
  playerName: string;
  characterName: string;
  attribute?: Attribute;
  target?: number;
  skill?: ExpeditionSkill;
  skillRank?: number;
  modifier?: number;
  mode?: SaveRollMode;
  roll?: SaveRollResult;
  outcome?: string;
  boonBane?: TrailblazeBoonBane;
  resource?: FoundResource;
  fatigueApplied?: boolean;
};

// Food/water a result produced, waiting for the GM to Apply it to sheets
// (V-005). "FoodOrWater" is Boon 64: the GM picks whichever fits the terrain.
export type FoundResource =
  | { kind: "FreshRations"; count: number }
  | { kind: "Water" }
  | { kind: "FoodOrWater" };

export type ExpeditionOutcome = {
  text: string;
  boonBane?: TrailblazeBoonBane;
  resource?: FoundResource;
};

// Trailblaze Boons that hand the Company food or water.
const RESOURCE_BOONS: Record<string, FoundResource> = {
  "21": { kind: "Water" },
  "22": { kind: "FreshRations", count: 1 },
  "34": { kind: "Water" },
  "64": { kind: "FoodOrWater" },
};

export const PendingExpeditionRollStore = writable<ExpeditionRollRequest | null>(null);
export const LastExpeditionRollStore = writable<ExpeditionRollResponse | null>(null);

let initialized = false;

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function skillRankForCharacter(pc: ReforgedCharacter, skill: ExpeditionSkill | undefined): number {
  if (!skill) return 0;
  let highest = 0;
  for (const node of pc.skillTreeNodes) {
    if (node.tree !== skill) continue;
    const match = node.node.match(/^R([1-4])$/);
    if (match) highest = Math.max(highest, parseInt(match[1], 10));
  }
  return highest;
}

function attributeFor(request: ExpeditionRollRequest, choice?: "INT" | "STR"): Attribute {
  const pc = get(PlayerCharacterStore);
  if (request.attributeMode === "INT") return "INT";
  if (request.attributeMode === "STR") return "STR";
  if (request.attributeMode === "HIGHER_INT_DEX") {
    return pc.attributes.INT >= pc.attributes.DEX ? "INT" : "DEX";
  }
  return choice ?? "INT";
}

export function expeditionRollMode(
  hasAdvantage: boolean,
  hasDisadvantage: boolean,
  untrainedDisadvantage: boolean,
): SaveRollMode {
  const disadvantage = hasDisadvantage || untrainedDisadvantage;
  if (hasAdvantage && disadvantage) return "normal";
  if (hasAdvantage) return "advantage";
  if (disadvantage) return "disadvantage";
  return "normal";
}

const BOON_BANE_TABLE: Record<string, { theme: string; boon: string; bane: string }> = {
  "11": {
    theme: "Shortcut / Detour",
    boon: "Find a genuine shortcut; reduce the remaining journey by 1 travel unit.",
    bane: "The obvious line is blocked or misleading; increase the remaining journey by 1 travel unit.",
  },
  "12": {
    theme: "Clear Line / Tangle",
    boon: "The next Trailblaze Save on this route has Advantage.",
    bane: "The next Trailblaze Save has Disadvantage unless the Company spends a Quarter clearing or bypassing the obstruction.",
  },
  "13": {
    theme: "Firm Ground / Bad Footing",
    boon: "Ignore 1 Quarter of terrain-added travel time during this journey, minimum arrival.",
    bane: "One traveler gains 1 Fatigue from a fall, bog, scramble, or similar hardship.",
  },
  "14": {
    theme: "Easy Crossing / Bad Crossing",
    boon: "The next ordinary crossing or similar obstacle costs no additional time.",
    bane: "A crossing or obstacle costs 1 Quarter to overcome or bypass unless the Company accepts an obvious stated risk.",
  },
  "15": {
    theme: "Weather Window / Weather Turn",
    boon: "Ignore one time or Fatigue cost caused by today's weather this Quarter.",
    bane: "Treat the next Quarter's weather effects as one step worse for travel purposes.",
  },
  "16": {
    theme: "Open Passage / Choked Passage",
    boon: "The Company may travel one additional Quarter today before Forced March begins.",
    bane: "One otherwise safe travel Quarter today is consumed clearing or bypassing an obstruction.",
  },
  "21": {
    theme: "Water",
    boon: "Find a safe usable water source; refill normally.",
    bane: "One accessible Water stock steps down one Usage Die.",
  },
  "22": {
    theme: "Food",
    boon: "Find 1 x d6 Fresh Ration without spending a Forage Quarter.",
    bane: "One accessible ration stock steps down one Usage Die.",
  },
  "23": {
    theme: "Fuel",
    boon: "Find sufficient dry fuel for the next camp without consuming carried fuel solely for the fire.",
    bane: "One applicable Torch, Oil, fuel, or light stock steps down one Usage Die.",
  },
  "24": {
    theme: "Ammunition",
    boon: "Recover usable ammunition; one applicable stock skips its next post-combat Usage roll.",
    bane: "One applicable ammunition stock steps down one Usage Die.",
  },
  "25": {
    theme: "Useful Material / Gear Damage",
    boon: "Find ordinary material usable as an improvised tool for one immediate wilderness problem.",
    bane: "One exposed ordinary item becomes Damaged; otherwise one minor ordinary item becomes unusable or is lost.",
  },
  "26": {
    theme: "Secure Cache / Dropped Load",
    boon: "Discover a dry memorable place where up to 2 slots may be cached and recovered on the return journey.",
    bane: "A loose 1-slot load is dropped or left behind; spend a Quarter recovering it or abandon it.",
  },
  "31": {
    theme: "Campsite",
    boon: "The next Make Camp Save has Advantage if the Company uses this site.",
    bane: "The next Make Camp Save has Disadvantage unless the Company spends time seeking another site.",
  },
  "32": {
    theme: "Shelter / Exposure",
    boon: "Find natural shelter; one ordinary weather interference cannot spoil the next Rest here.",
    bane: "One traveler gains 1 Fatigue from exposure.",
  },
  "33": {
    theme: "Dry Gear / Soaked Gear",
    boon: "Protect bedding, shelter, and essential camp gear; ignore one ordinary weather-related camp supply consequence tonight.",
    bane: "One relevant bedding/shelter item is soaked or compromised; the next camp must spend appropriate supplies or suffer weather interference. If none applies, one traveler gains 1 Fatigue.",
  },
  "34": {
    theme: "Camp Water / Dry Ground",
    boon: "Discover a safe usable water source suitable for camp.",
    bane: "No usable local water can be established at the next camp in this area; rely on carried or previously established water.",
  },
  "35": {
    theme: "Game / Barren Patch",
    boon: "The next Hunt or Forage Save today has Advantage.",
    bane: "The next Hunt or Forage Save made here has Disadvantage.",
  },
  "36": {
    theme: "Hazard Read / Hidden Hazard",
    boon: "Notice one ordinary nearby travel or camp hazard before it causes trouble.",
    bane: "One plausible nearby hazard goes unnoticed until it matters; resolve its effects normally.",
  },
  "41": {
    theme: "Tracks / Sign",
    boon: "Learn reliable information from nearby signs: approximate number, direction, and recency where evidence supports it.",
    bane: "The Company's own passage becomes obvious to a plausible nearby tracker or creature.",
  },
  "42": {
    theme: "High Ground / Blind Ground",
    boon: "The next Keep Watch Save today has Advantage.",
    bane: "The next Keep Watch Save today has Disadvantage.",
  },
  "43": {
    theme: "True Bearing / Disorientation",
    boon: "Confirm direction from a reliable landmark and learn a useful estimate of the remaining journey.",
    bane: "The Company loses orientation and becomes Lost; use result 12 instead if Lost is impossible in the fiction.",
  },
  "44": {
    theme: "Weather Sign / Sudden Front",
    boon: "Learn the next day's expected weather before its Pace is chosen.",
    bane: "A sudden change worsens the next Quarter's weather effects by one step.",
  },
  "45": {
    theme: "Regional Clue / Position Exposed",
    boon: "Reveal a reliable Sign toward a nearby Destination, Discovery, resource, faction, or hazard already present in the region.",
    bane: "The Company's movement reveals its position to one nearby threat or faction already established in the fiction.",
  },
  "46": {
    theme: "Concealment / Obvious Passage",
    boon: "Treat the Company as Cautious for today's Wilderness Event frequency without reducing Pace.",
    bane: "Treat the Company as particularly obvious for today's Wilderness Event frequency.",
  },
  "51": {
    theme: "Quiet Passage / Attention",
    boon: "Skip the next normal Wilderness Event check today.",
    bane: "Make an immediate Wilderness Event check.",
  },
  "52": {
    theme: "Hazard Warning / Poor Position",
    boon: "The next obstacle or hazard is noticed early enough to avoid, prepare for, or choose another approach.",
    bane: "The next obstacle or hazard begins with the Company poorly positioned; normal Saves and Keep Watch still apply.",
  },
  "53": {
    theme: "Creature Sign",
    boon: "If a Creature Event occurs today, the Company detects signs early enough to choose whether to avoid, prepare, or investigate.",
    bane: "If a Creature Event occurs today, its approach begins from an unfavorable direction; failed Keep Watch leaves the Company clearly unprepared.",
  },
  "54": {
    theme: "Travelers",
    boon: "If travelers, rivals, or another intelligent group is encountered today, the Company notices them first and may decide whether to reveal itself.",
    bane: "Such a group already present notices the Company's passage first; Reaction still determines disposition.",
  },
  "55": {
    theme: "Discovery",
    boon: "Reveal a small useful Discovery appropriate to the region.",
    bane: "Reveal a dangerous, costly, or troublesome Discovery or Sign appropriate to the region; no automatic combat.",
  },
  "56": {
    theme: "Event Rhythm",
    boon: "No random Wilderness Event occurs for the remainder of today unless already established by the fiction.",
    bane: "A Wilderness Event occurs today without requiring its normal trigger roll.",
  },
  "61": {
    theme: "Old Road / Broken Road",
    boon: "Discover and record an old path or better line; reduce this journey's remaining distance by 1 travel unit.",
    bane: "A washout, collapse, closure, or similar obstacle increases the remaining journey by 1 travel unit until bypassed, repaired, or superseded.",
  },
  "62": {
    theme: "Abandoned Camp",
    boon: "Find an old usable camp with ordinary shelter or fuel already present.",
    bane: "Signs show the obvious campsite was abandoned for a good reason; using it anyway gives Make Camp Disadvantage.",
  },
  "63": {
    theme: "Local Guidance / Boundary",
    boon: "A local sign, marker, trail, or reliable clue gives Advantage on the next two Trailblaze Saves along this route.",
    bane: "A closure, territorial boundary, dangerous crossing, or similar obstacle forces a choice: spend 1 Quarter bypassing it or knowingly accept the stated risk.",
  },
  "64": {
    theme: "Resource Pocket / Depletion",
    boon: "Find 1 x d6 Fresh Ration, usable water, ordinary fuel, or useful natural material - whichever best fits the terrain.",
    bane: "One fictionally appropriate carried Usage stock steps down one die. If none applies, one traveler gains 1 Fatigue.",
  },
  "65": {
    theme: "Fortune / Misfortune",
    boon: "Choose any other Boon on this table that fits the fiction.",
    bane: "GM chooses any other Bane on this table that fits the fiction.",
  },
  "66": {
    theme: "Major Discovery / Major Complication",
    boon: "Reveal a meaningful beneficial Opportunity or Discovery already supported by the region.",
    bane: "Reveal a major Sign, dangerous Discovery, or regional complication already supported by the setting.",
  },
};

async function trailblazeBoonBane(roll: SaveRollResult): Promise<TrailblazeBoonBane | undefined> {
  const critical = roll.firstRoll ?? roll.natural;
  const type = critical === 1 ? "Boon" : critical === 20 ? "Bane" : undefined;
  if (!type) return undefined;

  const dice = await rollDiceValues(2, 6, { rollTarget: "everyone", showResults: true });
  const code = `${dice[0]}${dice[1]}`;
  const entry = BOON_BANE_TABLE[code];
  if (!entry) return undefined;

  return {
    type,
    code,
    theme: entry.theme,
    effect: type === "Boon" ? entry.boon : entry.bane,
  };
}

export async function resolveExpeditionOutcome(
  kind: ExpeditionRollKind,
  roll: SaveRollResult,
): Promise<ExpeditionOutcome> {
  if (kind === "Forced March") {
    return {
      text: roll.success
        ? "Forced March succeeds; traveler may complete this Quarter."
        : "Forced March fails: +1 Fatigue and this traveler cannot travel another Quarter today.",
    };
  }
  if (kind === "Keep Watch") {
    return {
      text: roll.success
        ? "Keep Watch succeeds: the Company is not surprised and may avoid, prepare for, or approach what is ahead."
        : "Keep Watch fails: resolve the encounter with the Company unprepared.",
    };
  }
  if (kind === "Trailblaze") {
    const boonBane = await trailblazeBoonBane(roll);
    const pieces = [roll.success ? "Quarter progress succeeds." : "Quarter spent; no progress."];
    if (boonBane) {
      pieces.push(`${boonBane.type} ${boonBane.code} - ${boonBane.theme}: ${boonBane.effect}`);
    }
    const resource = boonBane?.type === "Boon" ? RESOURCE_BOONS[boonBane.code] : undefined;
    return { text: pieces.join(" "), boonBane, resource };
  }
  if (kind === "Forage for Food") {
    return roll.success
      ? { text: "Gain 1 x d6 Fresh Ration.", resource: { kind: "FreshRations", count: 1 } }
      : { text: "Nothing found; Quarter spent." };
  }
  if (kind === "Forage for Water") {
    return roll.success
      ? { text: "Establish a usable local water source if the terrain and fiction support one.", resource: { kind: "Water" } }
      : { text: "No usable water found; Quarter spent." };
  }
  if (kind === "Hunt") {
    if (!roll.success) return { text: "No prey taken; Quarter spent." };
    const prey = await rollSingleDie(6, { rollTarget: "everyone", showResults: true });
    const stocks = prey <= 3 ? 1 : prey <= 5 ? 2 : 4;
    return {
      text: `Prey d6 = ${prey}: gain ${stocks} x d6 Fresh Ration${stocks === 1 ? "" : "s"}.${roll.natural === 1 ? " Also recover a hide or other usable material." : ""}`,
      resource: { kind: "FreshRations", count: stocks },
    };
  }
  if (kind === "Fish") {
    if (!roll.success) return { text: "No useful catch; Quarter spent." };
    const catchRoll = await rollSingleDie(6, { rollTarget: "everyone", showResults: true });
    const stocks = catchRoll <= 3 ? 1 : catchRoll <= 5 ? 2 : 3;
    return {
      text: `Catch d6 = ${catchRoll}: gain ${stocks} x d6 Fresh Ration${stocks === 1 ? "" : "s"}.`,
      resource: { kind: "FreshRations", count: stocks },
    };
  }
  return {
    text: roll.success
      ? "Camp established; it supports a Normal Rest when the Company Sleeps."
      : "Camp established but supports only a Perilous Rest; GM applies one listed consequence.",
  };
}

export function initExpeditionRolls(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;

  OBR.broadcast.onMessage(REQUEST_KEY, ({ data }) => {
    const request = data as ExpeditionRollRequest;
    if (!request || request.targetPlayerId !== OBR.player.id) return;
    LastExpeditionRollStore.set(null);
    PendingExpeditionRollStore.set(request);
    showPopover(`${request.requestedBy} requests ${request.kind}. Open Company Expedition to roll.`);
  });
}

export async function requestExpeditionRoll(
  input: Omit<ExpeditionRollRequest, "requestId" | "requestedBy">,
  timeoutMs = 90000,
): Promise<ExpeditionRollResponse | null> {
  const requestId = id();
  const requestedBy = await OBR.player.getName();
  const request: ExpeditionRollRequest = { ...input, requestId, requestedBy };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ExpeditionRollResponse | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };

    const unsubscribe = OBR.broadcast.onMessage(RESULT_KEY, ({ data }) => {
      const response = data as ExpeditionRollResponse;
      if (response?.requestId === requestId) finish(response);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);

    OBR.broadcast.sendMessage(REQUEST_KEY, request, { destination: "ALL" });
  });
}

export async function resolvePendingExpeditionRoll(choice?: "INT" | "STR"): Promise<ExpeditionRollResponse | null> {
  const request = get(PendingExpeditionRollStore);
  if (!request) return null;
  if (request.attributeMode === "INT_OR_STR" && !choice) return null;

  const pc = get(PlayerCharacterStore);
  const rank = skillRankForCharacter(pc, request.skill);
  const attribute = attributeFor(request, choice);
  const modifier = request.baseModifier - rank * 2;
  const mode = expeditionRollMode(
    request.hasAdvantage,
    request.hasDisadvantage,
    request.untrainedDisadvantage && !!request.skill && rank === 0,
  );
  const roll = await rollReforgedSave(pc.attributes[attribute], modifier, mode, "everyone");
  const outcome = await resolveExpeditionOutcome(request.kind, roll);

  let fatigueApplied = false;
  if (request.applyFailureFatigue && !roll.success) {
    PlayerCharacterStore.set({ ...pc, fatigue: (pc.fatigue ?? 0) + 1 });
    fatigueApplied = true;
  }

  const response: ExpeditionRollResponse = {
    requestId: request.requestId,
    targetPlayerId: request.targetPlayerId,
    kind: request.kind,
    status: "rolled",
    playerName: await OBR.player.getName(),
    characterName: pc.name || (await OBR.player.getName()),
    attribute,
    target: pc.attributes[attribute],
    skill: request.skill,
    skillRank: request.skill ? rank : undefined,
    modifier,
    mode,
    roll,
    outcome: outcome.text,
    boonBane: outcome.boonBane,
    resource: outcome.resource,
    fatigueApplied,
  };

  LastExpeditionRollStore.set(response);
  PendingExpeditionRollStore.set(null);
  OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
  return response;
}

export async function declinePendingExpeditionRoll(): Promise<void> {
  const request = get(PendingExpeditionRollStore);
  if (!request) return;
  const pc = get(PlayerCharacterStore);
  const response: ExpeditionRollResponse = {
    requestId: request.requestId,
    targetPlayerId: request.targetPlayerId,
    kind: request.kind,
    status: "declined",
    playerName: await OBR.player.getName(),
    characterName: pc.name || (await OBR.player.getName()),
  };
  LastExpeditionRollStore.set(response);
  PendingExpeditionRollStore.set(null);
  OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
}
