import OBR from "@owlbear-rodeo/sdk";
import { parseAndRoll, rollDieSides, rollSave as rollSaveLocal } from "../utils";
import type { SaveRollMode, SaveRollResult } from "../utils";

export const DICE_PLUS_SOURCE = "rodeo.owlbear.reforged-sheet";

export type DicePlusRollTarget = "everyone" | "self" | "dm" | "gm_only";

type DicePlusDie = {
  value: number;
  kept?: boolean;
};

type DicePlusGroup = {
  diceType: string;
  dice: DicePlusDie[];
  total: number;
};

type DicePlusResultMessage = {
  rollId: string;
  result: {
    diceNotation: string;
    totalValue: number;
    rollSummary: string;
    groups: DicePlusGroup[];
  };
};

type DicePlusErrorMessage = {
  rollId: string;
  error: string;
  notation: string;
};

export type UnifiedRollResult = {
  total: number;
  breakdown: string;
  groups: DicePlusGroup[];
  usedDicePlus: boolean;
};

function id(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function checkDicePlusReady(timeoutMs = 700): Promise<boolean> {
  if (!OBR.isAvailable) return false;
  const requestId = id("ready");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(ready);
    };

    const unsubscribe = OBR.broadcast.onMessage("dice-plus/isReady", (event) => {
      const data = event.data as { requestId?: string; ready?: boolean };
      if (data?.ready === true && data.requestId === requestId) finish(true);
    });

    const timer = setTimeout(() => finish(false), timeoutMs);
    OBR.broadcast.sendMessage(
      "dice-plus/isReady",
      { requestId, timestamp: Date.now() },
      { destination: "ALL" },
    );
  });
}

async function requestDicePlusRoll(
  notation: string,
  rollTarget: DicePlusRollTarget,
  showResults: boolean,
  timeoutMs = 8000,
): Promise<DicePlusResultMessage | null> {
  if (!(await checkDicePlusReady())) return null;

  const rollId = id("roll");
  const playerName = await OBR.player.getName();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DicePlusResultMessage | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubResult();
      unsubError();
      resolve(result);
    };

    const unsubResult = OBR.broadcast.onMessage(`${DICE_PLUS_SOURCE}/roll-result`, (event) => {
      const data = event.data as DicePlusResultMessage;
      if (data?.rollId === rollId) finish(data);
    });

    const unsubError = OBR.broadcast.onMessage(`${DICE_PLUS_SOURCE}/roll-error`, (event) => {
      const data = event.data as DicePlusErrorMessage;
      if (data?.rollId === rollId) {
        console.error(`Dice+ roll failed for "${data.notation}": ${data.error}`);
        finish(null);
      }
    });

    const timer = setTimeout(() => finish(null), timeoutMs);

    OBR.broadcast.sendMessage(
      "dice-plus/roll-request",
      {
        rollId,
        playerId: OBR.player.id,
        playerName,
        rollTarget,
        diceNotation: notation,
        showResults,
        timestamp: Date.now(),
        source: DICE_PLUS_SOURCE,
      },
      { destination: "ALL" },
    );
  });
}

export async function rollNotation(
  notation: string,
  options: { rollTarget?: DicePlusRollTarget; showResults?: boolean } = {},
): Promise<UnifiedRollResult | null> {
  const rollTarget = options.rollTarget ?? "everyone";
  const showResults = options.showResults ?? true;
  const external = await requestDicePlusRoll(notation, rollTarget, showResults);

  if (external) {
    return {
      total: external.result.totalValue,
      breakdown: external.result.rollSummary,
      groups: external.result.groups ?? [],
      usedDicePlus: true,
    };
  }

  const local = parseAndRoll(notation);
  if (!local) return null;
  return { total: local.total, breakdown: local.breakdown, groups: [], usedDicePlus: false };
}

export async function rollSingleDie(
  sides: number,
  options: { rollTarget?: DicePlusRollTarget; showResults?: boolean } = {},
): Promise<number> {
  const result = await rollNotation(`d${sides}`, options);
  return result?.total ?? rollDieSides(sides);
}

export async function rollDiceValues(
  count: number,
  sides: number,
  options: { rollTarget?: DicePlusRollTarget; showResults?: boolean } = {},
): Promise<number[]> {
  const external = await requestDicePlusRoll(
    `${count}d${sides}`,
    options.rollTarget ?? "everyone",
    options.showResults ?? true,
  );
  if (external) {
    const dice = external.result.groups.flatMap((g) => g.dice ?? []).map((d) => d.value);
    if (dice.length >= count) return dice.slice(0, count);
  }
  return Array.from({ length: count }, () => rollDieSides(sides));
}

export async function rollReforgedSave(
  targetAttribute: number,
  modifier: number,
  mode: SaveRollMode = "normal",
  rollTarget: DicePlusRollTarget = "everyone",
): Promise<SaveRollResult> {
  const keep = mode === "advantage" ? "kl1" : mode === "disadvantage" ? "kh1" : "";
  const base = mode === "normal" ? "d20" : `2d20${keep}`;
  const notation = modifier ? `${base}${modifier >= 0 ? "+" : ""}${modifier}` : base;
  const external = await requestDicePlusRoll(notation, rollTarget, true);

  if (!external) return rollSaveLocal(targetAttribute, modifier, mode);

  const d20Group = external.result.groups.find((g) => g.diceType.toLowerCase() === "d20");
  const dice = d20Group?.dice ?? [];
  if (!dice.length) return rollSaveLocal(targetAttribute, modifier, mode);
  let natural: number;
  let otherRoll: number | undefined;
  const firstRoll = dice[0]?.value ?? external.result.totalValue - modifier;

  if (mode === "normal") {
    natural = dice[0]?.value ?? external.result.totalValue - modifier;
  } else {
    const kept = dice.find((d) => d.kept !== false);
    natural =
      kept?.value ??
      (mode === "advantage"
        ? Math.min(...dice.map((d) => d.value))
        : Math.max(...dice.map((d) => d.value)));
    const keptIndex = kept ? dice.indexOf(kept) : dice.findIndex((d) => d.value === natural);
    otherRoll = dice.find((_, index) => index !== keptIndex)?.value;
  }

  const total = natural + modifier;
  if (natural === 1) {
    return { natural, firstRoll, otherRoll, modifier, total, success: true, autoResult: "success" };
  }
  if (natural === 20) {
    return { natural, firstRoll, otherRoll, modifier, total, success: false, autoResult: "failure" };
  }
  return { natural, firstRoll, otherRoll, modifier, total, success: total <= targetAttribute };
}
