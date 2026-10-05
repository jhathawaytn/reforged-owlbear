import { describe, expect, it, vi } from "vitest";

// compendium.ts pulls in the Owlbear SDK, which reads `window` at import time.
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {} }));

import { formatFarthings, hagglerPrice, parsePrice, payFromPurse, planPurchase, purseValue } from "./coins";
import type { Purse } from "./coins";
import { COMPENDIUM } from "./compendium";
import { defaultPC } from "./model/ReforgedCharacter";
import type { ReforgedCharacter } from "./types";

const purse = (fa = 0, sp = 0, gp = 0, gc = 0): Purse => ({ farthings: fa, silverPennies: sp, goldPieces: gp, goldCrowns: gc });

function item(name: string) {
  const entry = COMPENDIUM.find((i) => i.name === name);
  if (!entry) throw new Error(`Missing compendium item: ${name}`);
  return entry;
}

function pcWith(coins: Purse, opts: { haggler?: boolean; str?: number } = {}): ReforgedCharacter {
  const pc = defaultPC();
  Object.assign(pc, coins);
  pc.gear = [];
  pc.attacks = [];
  if (opts.str !== undefined) pc.attributes = { ...pc.attributes, STR: opts.str };
  if (opts.haggler) pc.talentsOwned = [{ category: "Social", name: "Haggler", free: false }];
  return pc;
}

describe("parsePrice", () => {
  it("reads SP, fa, commas and 'each'", () => {
    expect(parsePrice("10 SP")).toEqual({ kind: "priced", farthings: 40 });
    expect(parsePrice("2 fa")).toEqual({ kind: "priced", farthings: 2 });
    expect(parsePrice("3,000 SP")).toEqual({ kind: "priced", farthings: 12000 });
    expect(parsePrice("5 SP each")).toEqual({ kind: "priced", farthings: 20 });
  });
  it("negligible is free; '-' is not for sale", () => {
    expect(parsePrice("negligible")).toEqual({ kind: "negligible" });
    expect(parsePrice("-")).toEqual({ kind: "unpriced" });
  });
  it("every compendium price is understood", () => {
    const unread = COMPENDIUM.filter((i) => parsePrice(i.price).kind === "unpriced" && i.price !== "-");
    expect(unread.map((i) => i.price)).toEqual([]);
  });
});

describe("hagglerPrice", () => {
  it("rounds 90% up to the next farthing (M-003)", () => {
    expect(hagglerPrice(36)).toBe(33); // 9 SP crowbar: 32.4 fa -> 33 fa
    expect(hagglerPrice(40)).toBe(36); // 10 SP -> 9 SP exactly
    expect(hagglerPrice(1)).toBe(1);
  });
});

describe("formatFarthings", () => {
  it("reads like book prices: SP plus leftover fa", () => {
    expect(formatFarthings(52)).toBe("13 SP");
    expect(formatFarthings(41)).toBe("10 SP 1 fa");
    expect(formatFarthings(12000)).toBe("3,000 SP");
    expect(formatFarthings(2)).toBe("2 fa");
    expect(formatFarthings(33)).toBe("8 SP 1 fa");
  });
});

describe("payFromPurse", () => {
  it("pays exactly with the right coins", () => {
    const p = payFromPurse(purse(0, 20), 40);
    expect(p).toMatchObject({ ok: true, after: purse(0, 10) });
  });
  it("breaks a Gold Piece for a 13 SP item and gives change", () => {
    const p = payFromPurse(purse(0, 0, 2), 52);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.paid).toEqual(purse(0, 0, 2));
    expect(p.change).toEqual(purse(0, 7));
    expect(p.after).toEqual(purse(0, 7, 0));
  });
  it("uses smaller coins before breaking a big one, and returns ones it didn't need", () => {
    const p = payFromPurse(purse(0, 10, 1), 52);
    expect(p).toMatchObject({ ok: true, paid: purse(0, 3, 1), after: purse(0, 7, 0) });
    const q = payFromPurse(purse(3, 0, 1), 4);
    expect(q).toMatchObject({ ok: true, paid: purse(0, 0, 1), after: purse(3, 9, 0) });
  });
  it("can leave the purse at exactly 0", () => {
    expect(payFromPurse(purse(0, 13), 52)).toMatchObject({ ok: true, after: purse() });
  });
  it("refuses when short, and says by how much", () => {
    expect(payFromPurse(purse(0, 12), 52)).toEqual({ ok: false, shortBy: 4 });
  });
  it("never changes the total except by the cost", () => {
    const start = purse(7, 3, 2, 1);
    const p = payFromPurse(start, 734);
    expect(p.ok && purseValue(p.after)).toBe(purseValue(start) - 734);
  });
});

describe("planPurchase", () => {
  it("normal buy deducts coin and adds the item (and attack row for weapons)", () => {
    const plan = planPurchase(pcWith(purse(0, 20)), item("Mace"));
    expect(plan.buyable && plan.after).toBeTruthy();
    if (!plan.buyable || !plan.after) return;
    expect(plan.price).toBe(52);
    expect(plan.after.silverPennies).toBe(7);
    expect(plan.after.gear.map((g) => g.name)).toEqual(["Mace"]);
    expect(plan.after.attacks[0].gearId).toBe(plan.after.gear[0].id);
  });
  it("applies Haggler", () => {
    const plan = planPurchase(pcWith(purse(0, 20), { haggler: true }), item("Spear"));
    expect(plan).toMatchObject({ buyable: true, haggler: true, listed: 40, price: 36 });
  });
  it("not enough coin: no resulting character", () => {
    const plan = planPurchase(pcWith(purse(0, 5)), item("Mace"));
    expect(plan).toMatchObject({ buyable: true, payment: { ok: false, shortBy: 32 }, after: undefined });
  });
  it("warns when the buy would Overburden", () => {
    const plan = planPurchase(pcWith(purse(0, 0, 10), { str: 1 }), item("Greatsword"));
    expect(plan).toMatchObject({ buyable: true, overburdenedAfter: true });
  });
  it("negligible costs nothing; '-' can't be bought", () => {
    expect(planPurchase(pcWith(purse()), item("Club"))).toMatchObject({ buyable: true, price: 0, payment: { ok: true } });
    expect(planPurchase(pcWith(purse(0, 100)), item("Fresh Rations"))).toMatchObject({ buyable: false });
  });
});
