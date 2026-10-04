// Ranged ammunition (§9.4.8): stocks, not per-shot tracking.
// - "A ranged weapon without an appropriate ammunition stock cannot be fired."
// - "If ammunition from a stock was used during a combat, roll that stock's
//   Usage Die once after the combat. On 1–3, step it down."
// Pure functions only (tested in ammunition.test.ts); components do the
// rolling and notifications.
import { stepDownDie } from "./types";
import type { Attack, GearItem, ReforgedCharacter, UsageDieState } from "./types";

export type AmmoStockName = "Arrow Quiver" | "Bolt Case" | "Sling Stone Pouch";

// Which stock a weapon draws from, by weapon name. Covers the compendium's
// Sling, Hand Crossbow, Crossbow, Shortbow, Hunting Bow, and Longbow, plus
// similarly named custom weapons. Anything else (melee, individually
// tracked thrown weapons) needs no stock and is never blocked.
export function ammoStockForWeapon(weaponName: string): AmmoStockName | null {
  const name = weaponName.toLowerCase();
  if (name.includes("sling")) return "Sling Stone Pouch";
  if (name.includes("crossbow")) return "Bolt Case";
  if (/bow\b/.test(name)) return "Arrow Quiver";
  return null;
}

function isStockOf(item: GearItem, stock: AmmoStockName): boolean {
  return item.usageKind === "Ammunition" && item.name.toLowerCase().includes(stock.toLowerCase());
}

function usable(item: GearItem): boolean {
  return !!item.usageDie && item.usageDie !== "depleted";
}

// ok false = cannot be fired (message says why). ok true with stock null =
// the weapon needs no ammunition. A flat shape rather than a union: this
// project's tsconfig doesn't narrow unions on a boolean field.
export type AmmoCheck = { ok: boolean; stock: GearItem | null; message: string };

// The weapon is the attack's linked Gear row when there is one, otherwise
// the attack's own name. Prefers a stock already drawn on this combat so a
// combat keeps using one stock, then the first usable stock in gear order.
export function checkAmmunition(pc: ReforgedCharacter, attack: Attack): AmmoCheck {
  const linked = attack.gearId ? pc.gear.find((g) => g.id === attack.gearId) : undefined;
  const required = ammoStockForWeapon(linked?.name ?? attack.name);
  if (!required) return { ok: true, stock: null, message: "" };

  const stocks = pc.gear.filter((g) => isStockOf(g, required));
  const live = stocks.filter(usable);
  if (!live.length) {
    return {
      ok: false,
      stock: null,
      message: stocks.length
        ? `${attack.name || "Attack"}: ${required} is depleted - it cannot be fired.`
        : `${attack.name || "Attack"}: No ${required} available - it cannot be fired.`,
    };
  }
  const used = pc.ammoUsedThisCombat ?? [];
  return { ok: true, stock: live.find((s) => used.includes(s.id)) ?? live[0], message: "" };
}

// Record a stock as used, but only during combat: the after-combat Usage
// roll is the only ammunition bookkeeping the rules ask for.
export function recordAmmunitionUse(pc: ReforgedCharacter, stock: GearItem | null): void {
  if (!stock || !pc.combatActive) return;
  const used = pc.ammoUsedThisCombat ?? [];
  if (!used.includes(stock.id)) pc.ammoUsedThisCombat = [...used, stock.id];
}

// Stocks to roll once each when combat ends (still present, not depleted).
export function stocksToRollAfterCombat(pc: ReforgedCharacter): GearItem[] {
  const used = pc.ammoUsedThisCombat ?? [];
  return pc.gear.filter((g) => used.includes(g.id) && usable(g));
}

// One after-combat Usage roll: 1–3 steps the die down.
export function ammunitionAfterRoll(die: UsageDieState, roll: number): UsageDieState {
  if (die === "depleted") return die;
  return roll <= 3 ? stepDownDie(die) : die;
}
