import { describe, expect, it, vi } from "vitest";

// compendium.ts imports DicePlus/Notifier, which import the Owlbear SDK, and
// the SDK reads `window` at import time. These tests only touch the static
// tables, so a stub SDK is enough to load the module under Node.
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {} }));

import { COMPENDIUM, compendiumItemToGear } from "./compendium";

function item(name: string) {
  const found = COMPENDIUM.find((entry) => entry.name === name);
  if (!found) throw new Error(`Missing compendium item: ${name}`);
  return found;
}

describe("compendium default inventory zones (§9.1.2, §9.5)", () => {
  it("puts a Backpack in Worn so it can unlock the Backpack zone", () => {
    expect(compendiumItemToGear(item("Backpack")).zone).toBe("Worn");
  });

  it("puts full Shields and Bucklers in Hand rather than Worn", () => {
    expect(compendiumItemToGear(item("Shield")).zone).toBe("Hand");
    expect(compendiumItemToGear(item("Buckler")).zone).toBe("Hand");
  });

  it("keeps ordinary worn armor in Worn", () => {
    expect(compendiumItemToGear(item("Gambeson")).zone).toBe("Worn");
    expect(compendiumItemToGear(item("Helm")).zone).toBe("Worn");
  });
});
