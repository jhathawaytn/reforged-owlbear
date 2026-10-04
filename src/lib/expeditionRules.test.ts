import { describe, expect, it, vi } from "vitest";

// ExpeditionStore imports the Owlbear SDK, which reads `window` at import time.
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {} }));

import {
  declaringPaceBreaksCautiousCommitment,
  defaultActivityForQuarter,
  effectiveKnownRouteBudget,
  knownRouteBaseRange,
  knownRouteEventsRemaining,
  legacyBaseBudget,
} from "./expeditionRules";
import { expeditionStateWithDefaults, defaultExpeditionState } from "./model/ExpeditionStore";

describe("Known Route Event budget (§11.8.2, V-015)", () => {
  it("uses the recorded-travel-time table", () => {
    expect(knownRouteBaseRange(0)).toEqual({ min: 0, max: 0 });
    expect(knownRouteBaseRange(2)).toEqual({ min: 0, max: 1 });
    expect(knownRouteBaseRange(3)).toEqual({ min: 1, max: 2 });
    expect(knownRouteBaseRange(7)).toEqual({ min: 1, max: 2 });
    expect(knownRouteBaseRange(8)).toEqual({ min: 2, max: 3 });
  });

  it("is unset until the GM picks a number", () => {
    expect(effectiveKnownRouteBudget(-1, true, true)).toBe(-1);
    expect(knownRouteEventsRemaining(-1, 0)).toBe(0);
  });

  it("applies +1 dangerous and −1 whole-journey Cautious, minimum 0", () => {
    expect(effectiveKnownRouteBudget(2, false, false)).toBe(2);
    expect(effectiveKnownRouteBudget(2, true, false)).toBe(3);
    expect(effectiveKnownRouteBudget(2, false, true)).toBe(1);
    expect(effectiveKnownRouteBudget(2, true, true)).toBe(2);
    expect(effectiveKnownRouteBudget(0, false, true)).toBe(0);
  });

  it("toggling Cautious on and off at the 0 floor restores the original budget", () => {
    // The old model baked modifiers into one number, so 0 → 0 → 1 drifted.
    const base = 0;
    expect(effectiveKnownRouteBudget(base, false, true)).toBe(0);
    expect(effectiveKnownRouteBudget(base, false, false)).toBe(0);
  });

  it("breaking the commitment mid-route keeps events already resolved", () => {
    const resolved = 1;
    const committed = effectiveKnownRouteBudget(2, false, true); // 1
    expect(knownRouteEventsRemaining(committed, resolved)).toBe(0);
    const broken = effectiveKnownRouteBudget(2, false, false); // 2
    expect(knownRouteEventsRemaining(broken, resolved)).toBe(1);
  });

  it("never reports negative remaining events", () => {
    expect(knownRouteEventsRemaining(1, 3)).toBe(0);
  });
});

describe("Cautious commitment break (V-015)", () => {
  it("breaks when a non-Cautious Pace is declared on a committed Known Route", () => {
    expect(declaringPaceBreaksCautiousCommitment("Known Route", true, "Steady")).toBe(true);
    expect(declaringPaceBreaksCautiousCommitment("Known Route", true, "Forced")).toBe(true);
  });

  it("does not break when staying Cautious, uncommitted, or Unmapped", () => {
    expect(declaringPaceBreaksCautiousCommitment("Known Route", true, "Cautious")).toBe(false);
    expect(declaringPaceBreaksCautiousCommitment("Known Route", false, "Steady")).toBe(false);
    expect(declaringPaceBreaksCautiousCommitment("Unmapped Country", true, "Steady")).toBe(false);
  });
});

describe("Ordinary-day Quarter defaults (V-004)", () => {
  it("is Travel · Travel · Make Camp · Sleep", () => {
    expect(defaultActivityForQuarter("Morning")).toBe("Travel");
    expect(defaultActivityForQuarter("Day")).toBe("Travel");
    expect(defaultActivityForQuarter("Evening")).toBe("Make Camp");
    expect(defaultActivityForQuarter("Night")).toBe("Sleep");
  });
});

describe("Saved-state migration", () => {
  it("recovers the base budget from a pre-0.1.19 save", () => {
    expect(legacyBaseBudget(-1, true, true)).toBe(-1);
    expect(legacyBaseBudget(3, true, false)).toBe(2);
    expect(legacyBaseBudget(1, false, true)).toBe(2);

    const old = defaultExpeditionState();
    const { knownRouteBaseBudget: _drop, ...wildernessWithoutBase } = old.wilderness;
    const migrated = expeditionStateWithDefaults({
      ...old,
      wilderness: {
        ...wildernessWithoutBase,
        knownRouteEventBudget: 1,
        knownRouteCautiousCommitment: true,
        knownRouteEventsResolved: 1,
      } as never,
    });
    expect(migrated.wilderness.knownRouteBaseBudget).toBe(2);
    expect(migrated.wilderness.knownRouteEventsResolved).toBe(1);
    expect("knownRouteEventBudget" in migrated.wilderness).toBe(false);
  });

  it("keeps a current save's base budget as-is", () => {
    const current = defaultExpeditionState();
    current.wilderness.knownRouteBaseBudget = 0;
    current.wilderness.knownRouteCautiousCommitment = true;
    expect(expeditionStateWithDefaults(current).wilderness.knownRouteBaseBudget).toBe(0);
  });
});
