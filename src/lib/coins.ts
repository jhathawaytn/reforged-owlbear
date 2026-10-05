import type { CoinDenomination, ReforgedCharacter } from "./types";
import type { CompendiumItem } from "./compendium";
import { withCompendiumItem } from "./compendium";
import { filledSlots, inventoryCapacity, isOverburdened } from "./model/ReforgedCharacter";

// §9.2.1 currency: 4 fa = 1 SP, 10 SP = 1 GP, 25 GP = 1 Gold Crown.
// All coin math runs in farthings so there are never fractions.
export const FARTHINGS_PER: Record<CoinDenomination, number> = {
  farthings: 1,
  silverPennies: 4,
  goldPieces: 40,
  goldCrowns: 1000,
};

export type Purse = Record<CoinDenomination, number>;

const SMALLEST_FIRST: CoinDenomination[] = ["farthings", "silverPennies", "goldPieces", "goldCrowns"];
const LARGEST_FIRST: CoinDenomination[] = [...SMALLEST_FIRST].reverse();

const SHORT_NAME: Record<CoinDenomination, string> = {
  farthings: "fa",
  silverPennies: "SP",
  goldPieces: "GP",
  goldCrowns: "GC",
};

export function purseOf(pc: ReforgedCharacter): Purse {
  return {
    farthings: pc.farthings ?? 0,
    silverPennies: pc.silverPennies ?? 0,
    goldPieces: pc.goldPieces ?? 0,
    goldCrowns: pc.goldCrowns ?? 0,
  };
}

export function purseValue(purse: Purse): number {
  return SMALLEST_FIRST.reduce((acc, d) => acc + Math.max(0, purse[d]) * FARTHINGS_PER[d], 0);
}

export type ParsedPrice =
  | { kind: "priced"; farthings: number }
  | { kind: "negligible" } // costs nothing to buy
  | { kind: "unpriced" }; // "-" or anything unreadable - not for sale, use Add free

// Compendium prices are strings: "10 SP", "3,000 SP", "2 fa", "5 SP each",
// "negligible", "-". "each" is the price of one.
export function parsePrice(price: string): ParsedPrice {
  const text = price.trim().toLowerCase();
  if (text === "negligible") return { kind: "negligible" };
  const match = text.match(/^([\d,]+(?:\.\d+)?)\s*(fa|sp|gp|gc)\b/);
  if (!match) return { kind: "unpriced" };
  const amount = Number(match[1].replace(/,/g, ""));
  const unit = { fa: "farthings", sp: "silverPennies", gp: "goldPieces", gc: "goldCrowns" }[match[2]] as CoinDenomination;
  if (!Number.isFinite(amount)) return { kind: "unpriced" };
  return { kind: "priced", farthings: Math.ceil(amount * FARTHINGS_PER[unit]) };
}

// Haggler: 90% of listed price, rounded UP to the next farthing (M-003 ruling).
export function hagglerPrice(farthings: number): number {
  return Math.ceil((farthings * 9) / 10);
}

export function hasHaggler(pc: ReforgedCharacter): boolean {
  return (pc.talentsOwned ?? []).some((t) => t.name === "Haggler");
}

// An amount the way the book lists prices - Silver Pennies plus any leftover
// farthings: 52 -> "13 SP", 33 -> "8 SP 1 fa", 1000 -> "250 SP".
export function formatFarthings(farthings: number): string {
  const sp = Math.floor(farthings / 4);
  const fa = farthings % 4;
  if (sp && fa) return `${sp.toLocaleString("en-US")} SP ${fa} fa`;
  return sp ? `${sp.toLocaleString("en-US")} SP` : `${fa} fa`;
}

export function formatCoins(coins: Purse): string {
  const parts = LARGEST_FIRST.filter((d) => coins[d] > 0).map((d) => `${coins[d]} ${SHORT_NAME[d]}`);
  return parts.length ? parts.join(" ") : "nothing";
}

// Fewest coins for an amount (how change is handed back).
function toCoins(farthings: number): Purse {
  const coins: Purse = { farthings: 0, silverPennies: 0, goldPieces: 0, goldCrowns: 0 };
  let left = farthings;
  for (const d of LARGEST_FIRST) {
    coins[d] = Math.floor(left / FARTHINGS_PER[d]);
    left -= coins[d] * FARTHINGS_PER[d];
  }
  return coins;
}

export type Payment =
  | { ok: true; paid: Purse; change: Purse; after: Purse }
  | { ok: false; shortBy: number };

// Pay `cost` farthings from the purse, breaking larger coins and taking change
// automatically (Jason, Oct 3: D3 yes). Spends the smallest coins first, then
// hands back any coins that turned out not to be needed, so a 1 SP buy from
// "3 fa + 1 GP" pays the GP and keeps the farthings. Change comes back in the
// fewest coins.
export function payFromPurse(purse: Purse, cost: number): Payment {
  const total = purseValue(purse);
  if (cost > total) return { ok: false, shortBy: cost - total };

  const paid: Purse = { farthings: 0, silverPennies: 0, goldPieces: 0, goldCrowns: 0 };
  let remaining = cost;
  for (const d of SMALLEST_FIRST) {
    if (remaining <= 0) break;
    const take = Math.min(Math.max(0, purse[d]), Math.ceil(remaining / FARTHINGS_PER[d]));
    paid[d] = take;
    remaining -= take * FARTHINGS_PER[d];
  }

  let overpaid = -remaining;
  for (const d of SMALLEST_FIRST) {
    const giveBack = Math.min(paid[d], Math.floor(overpaid / FARTHINGS_PER[d]));
    paid[d] -= giveBack;
    overpaid -= giveBack * FARTHINGS_PER[d];
  }

  const change = toCoins(overpaid);
  const after = { ...purse };
  for (const d of SMALLEST_FIRST) after[d] = Math.max(0, purse[d]) - paid[d] + change[d];
  return { ok: true, paid, change, after };
}

export type PurchasePlan =
  | { buyable: false; reason: string }
  | {
      buyable: true;
      listed: number;
      price: number; // what's actually charged (after Haggler)
      haggler: boolean;
      payment: Payment;
      after?: ReforgedCharacter; // only when the coin covers it
      overburdenedAfter: boolean;
      slotsAfter: number;
      capacity: number;
    };

// Everything the Buy confirmation shows: listed price, Haggler price, how
// it's paid, and the slot result. Applying it is just `pc = plan.after`.
export function planPurchase(pc: ReforgedCharacter, item: CompendiumItem): PurchasePlan {
  const parsed = parsePrice(item.price);
  if (parsed.kind === "unpriced") return { buyable: false, reason: "No listed price - use Add free." };
  const listed = parsed.kind === "priced" ? parsed.farthings : 0;
  // Haggler covers Standard mundane equipment; every compendium entry is.
  const haggler = hasHaggler(pc) && listed > 0;
  const price = haggler ? hagglerPrice(listed) : listed;
  const payment = payFromPurse(purseOf(pc), price);
  const base = payment.ok ? { ...pc, ...payment.after } : pc;
  const withItem = withCompendiumItem(base, item);
  return {
    buyable: true,
    listed,
    price,
    haggler,
    payment,
    after: payment.ok ? withItem : undefined,
    overburdenedAfter: isOverburdened(withItem),
    slotsAfter: filledSlots(withItem),
    capacity: inventoryCapacity(withItem),
  };
}
