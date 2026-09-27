export function clamp(n: number, min: number, max: number): number {
  return Math.max(Math.min(max, n), min);
}

export function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function addSign(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export function rollDieSides(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export type SaveRollMode = "normal" | "advantage" | "disadvantage";

export type SaveRollResult = {
  natural: number; // the kept d20, before modifiers
  firstRoll: number; // literal first d20 rolled; some procedures key off this even when it isn't kept
  otherRoll?: number; // the die not kept, only for advantage/disadvantage
  modifier: number;
  total: number;
  success: boolean;
  autoResult?: "success" | "failure"; // set when natural 1 or 20 overrides modifiers
};

// Reforged's universal Save (Ch.2, §2.5-2.7): roll a d20, apply modifiers,
// succeed on a final result <= the Attribute. A natural 1 always succeeds
// and a natural 20 always fails, regardless of modifiers. Advantage rolls
// two d20 and keeps the LOWER (better, since this is roll-under);
// Disadvantage keeps the HIGHER.
export function rollSave(
  targetAttribute: number,
  modifier: number,
  mode: SaveRollMode = "normal",
): SaveRollResult {
  const a = rollD20();
  const b = mode === "normal" ? undefined : rollD20();
  let natural = a;
  let otherRoll: number | undefined;
  if (b !== undefined) {
    // Keep min/max of the pair, not "whichever wasn't rolled first" - the
    // second roll (b) is just as likely to be the one that's actually kept.
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (mode === "advantage") {
      natural = lo;
      otherRoll = hi;
    } else {
      natural = hi;
      otherRoll = lo;
    }
  }

  if (natural === 1) {
    return { natural, firstRoll: a, otherRoll, modifier, total: natural + modifier, success: true, autoResult: "success" };
  }
  if (natural === 20) {
    return { natural, firstRoll: a, otherRoll, modifier, total: natural + modifier, success: false, autoResult: "failure" };
  }

  const total = natural + modifier;
  return { natural, firstRoll: a, otherRoll, modifier, total, success: total <= targetAttribute };
}

// Parses simple dice notation like "d6", "2d6", "d6+2", "d8-1" and rolls it.
// Returns null if the notation can't be parsed, so callers can fall back
// gracefully instead of silently rolling garbage.
export function parseAndRoll(notation: string): { total: number; breakdown: string } | null {
  const match = notation
    .trim()
    .toLowerCase()
    .match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/);
  if (!match) return null;

  const numDice = match[1] ? parseInt(match[1]) : 1;
  const sides = parseInt(match[2]);
  const modifier = match[3] ? parseInt(match[3].replace(/\s/g, "")) : 0;

  if (numDice < 1 || numDice > 100 || sides < 2 || sides > 1000) return null;

  const rolls: number[] = [];
  for (let i = 0; i < numDice; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
  const breakdown = `${rolls.join(" + ")}${modifier ? ` ${addSign(modifier)}` : ""} = ${sum}`;
  return { total: sum, breakdown };
}

// eslint-disable-next-line
export function debounce<F extends (...args: any[]) => any>(
  fn: F,
  ms = 500,
  onStartWaiting?: () => void,
  onFinish?: () => void,
) {
  let timer: ReturnType<typeof setTimeout>;

  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    onStartWaiting?.();
    return new Promise((resolve) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        resolve(fn(...args));
        onFinish?.();
      }, ms);
    });
  };
}
