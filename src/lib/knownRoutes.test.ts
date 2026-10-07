import { describe, expect, it, vi } from "vitest";

// CampaignStore imports the Owlbear SDK, which reads `window` at import time.
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {} }));
import {
  addRoute,
  defaultRouteName,
  destinationsFrom,
  removeRoute,
  routesBetween,
  updateRoute,
  validateRoute,
} from "./knownRoutes";
import type { KnownRouteRecord, NewKnownRoute } from "./knownRoutes";
import { campaignStateWithDefaults } from "./model/CampaignStore";

const draft = (over: Partial<NewKnownRoute> = {}): NewKnownRoute => ({
  name: "",
  from: "Hamlet",
  to: "Golden Boar",
  quarters: 3,
  bothWays: true,
  notes: "",
  ...over,
});

describe("recording a Known Route", () => {
  it("fills in a default name and trims", () => {
    const routes = addRoute([], draft({ from: "  Hamlet ", notes: " ford above the mill " }), "r1");
    expect(routes).toEqual([
      { id: "r1", name: "Hamlet - Golden Boar", from: "Hamlet", to: "Golden Boar", quarters: 3, bothWays: true, notes: "ford above the mill" },
    ]);
    expect(defaultRouteName("", "X")).toBe("? - X");
  });
  it("rejects missing places, the same place twice, and less than 1 Quarter", () => {
    expect(validateRoute(draft())).toBeNull();
    expect(validateRoute(draft({ to: " " }))).toBe("Enter both places.");
    expect(validateRoute(draft({ to: "hamlet" }))).toBe("A route needs two different places.");
    expect(validateRoute(draft({ quarters: 0 }))).toBe("Recorded Route Time must be at least 1 Quarter.");
    expect(validateRoute(draft({ quarters: 1.5 }))).not.toBeNull();
  });
});

describe("finding recorded routes", () => {
  const routes: KnownRouteRecord[] = [
    ...addRoute([], draft({ name: "Mill road" }), "a"),
    ...addRoute([], draft({ name: "Ridge path", quarters: 5 }), "b"),
    ...addRoute([], draft({ name: "River (downstream only)", from: "Golden Boar", to: "Dunmere", bothWays: false }), "c"),
  ];
  it("ignores case and spacing", () => {
    expect(routesBetween(routes, "hamlet", "golden  boar").map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("two routes between the same places are both offered", () => {
    expect(routesBetween(routes, "Hamlet", "Golden Boar")).toHaveLength(2);
  });
  it("a two-way route serves the immediate return trip", () => {
    expect(routesBetween(routes, "Golden Boar", "Hamlet").map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("a one-way route doesn't work backwards", () => {
    expect(routesBetween(routes, "Golden Boar", "Dunmere").map((r) => r.id)).toEqual(["c"]);
    expect(routesBetween(routes, "Dunmere", "Golden Boar")).toEqual([]);
  });
  it("lists destinations reachable from a place", () => {
    expect(destinationsFrom(routes, "Golden Boar")).toEqual(["Dunmere", "Hamlet"]);
    expect(destinationsFrom(routes, "Dunmere")).toEqual([]);
    expect(destinationsFrom(routes, "")).toEqual([]);
  });
  it("blank places never match", () => {
    expect(routesBetween(routes, "", "")).toEqual([]);
  });
});

describe("editing the ledger", () => {
  const routes = addRoute([], draft(), "a");
  it("rename / re-time", () => {
    expect(updateRoute(routes, "a", { name: "Old road", quarters: 4 })[0]).toMatchObject({ name: "Old road", quarters: 4 });
  });
  it("delete (route destroyed, §11.1.5)", () => {
    expect(removeRoute(routes, "a")).toEqual([]);
  });
  it("loads saved campaign data, filling fields added later", () => {
    const loaded = campaignStateWithDefaults({
      knownRoutes: [{ id: "x", name: "N", from: "A", to: "B", quarters: 2 } as KnownRouteRecord],
    });
    expect(loaded.knownRoutes[0]).toMatchObject({ bothWays: true, notes: "" });
    expect(campaignStateWithDefaults(undefined)).toEqual({ knownRoutes: [] });
  });
});
