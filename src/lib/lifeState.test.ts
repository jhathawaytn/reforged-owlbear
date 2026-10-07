import { describe, expect, it, vi } from "vitest";

// ReforgedCharacter.ts pulls in the Owlbear SDK, which reads `window` at import time.
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {} }));

import { applyLifeAction, lifeStateOf, markDead } from "./lifeState";
import { defaultPC, withDefaults } from "./model/ReforgedCharacter";
import type { ReforgedCharacter } from "./types";

function pc(over: Partial<ReforgedCharacter> = {}): ReforgedCharacter {
  const base = defaultPC();
  return {
    ...base,
    name: "Mara",
    maxHitPoints: 9,
    hitPoints: 0,
    attributes: { ...base.attributes, STR: 3 },
    attributeMax: { ...base.attributeMax, STR: 11 },
    ...over,
  };
}

function ok(result: ReturnType<typeof applyLifeAction>): ReforgedCharacter {
  if ("error" in result) throw new Error(result.error);
  return result.pc;
}

describe("life state", () => {
  it("reads alive / mortally wounded / clinging / dead", () => {
    expect(lifeStateOf(pc())).toBe("alive");
    expect(lifeStateOf(pc({ mortalWound: true }))).toBe("mortallyWounded");
    expect(lifeStateOf(pc({ conditions: ["Clinging"] }))).toBe("clinging");
    expect(lifeStateOf(pc({ dead: true, mortalWound: true }))).toBe("dead");
  });
  it("old saves load as alive", () => {
    const old = pc() as Partial<ReforgedCharacter>;
    delete old.dead;
    expect(withDefaults(old).dead).toBe(false);
  });
});

describe("Stabilized (§14.7)", () => {
  it("clears the Mortal Wound and sets Clinging", () => {
    const after = ok(applyLifeAction(pc({ mortalWound: true, conditions: ["Bleeding"] }), "stabilize"));
    expect(after.mortalWound).toBe(false);
    expect(after.conditions).toEqual(["Bleeding", "Clinging"]);
    expect(lifeStateOf(after)).toBe("clinging");
  });
  it("only applies to a Mortally Wounded character", () => {
    expect(applyLifeAction(pc(), "stabilize")).toEqual({ error: "Mara isn't Mortally Wounded." });
    expect("error" in applyLifeAction(pc({ dead: true, mortalWound: true }), "stabilize")).toBe(true);
  });
});

describe("leaving Clinging", () => {
  const clinging = () => pc({ conditions: ["Clinging"] });
  it("Healing Potion: all HP, STR to half max rounded down", () => {
    const after = ok(applyLifeAction(clinging(), "potion"));
    expect(after.conditions).toEqual([]);
    expect(after.hitPoints).toBe(9);
    expect(after.attributes.STR).toBe(5); // 11 / 2 = 5.5 -> 5
  });
  it("professional recovery: STR 1, HP untouched", () => {
    const after = ok(applyLifeAction(clinging(), "professional"));
    expect(after.attributes.STR).toBe(1);
    expect(after.hitPoints).toBe(0);
    expect(lifeStateOf(after)).toBe("alive");
  });
  it("GM override only ends Clinging", () => {
    const after = ok(applyLifeAction(clinging(), "override"));
    expect(after.conditions).toEqual([]);
    expect(after.attributes.STR).toBe(3);
  });
  it("exits need Clinging", () => {
    expect("error" in applyLifeAction(pc({ mortalWound: true }), "potion")).toBe(true);
  });
});

describe("death", () => {
  it("marking dead clears the wound states", () => {
    const after = markDead(pc({ mortalWound: true, conditions: ["Clinging", "Bleeding"] }));
    expect(after).toMatchObject({ dead: true, mortalWound: false, conditions: ["Bleeding"] });
  });
  it("GM can undo a death", () => {
    const after = ok(applyLifeAction(markDead(pc()), "revive"));
    expect(lifeStateOf(after)).toBe("alive");
    expect("error" in applyLifeAction(pc(), "revive")).toBe(true);
  });
});
