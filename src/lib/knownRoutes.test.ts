import { describe, expect, it } from "vitest";
import {
  defaultRouteName,
  destinationsFrom,
  normalizeRoute,
  routeFromMetadata,
  routeLabelText,
  routesBetween,
  validateRoute,
} from "./knownRoutes";
import type { KnownRouteRecord, NewKnownRoute } from "./knownRoutes";

const draft = (over: Partial<NewKnownRoute> = {}): NewKnownRoute => ({
  name: "",
  from: "Hamlet",
  to: "Golden Boar",
  quarters: 3,
  bothWays: true,
  notes: "",
  ...over,
});

const route = (id: string, over: Partial<NewKnownRoute> = {}): KnownRouteRecord => ({ id, ...normalizeRoute(draft(over)) });

describe("recording a Known Route", () => {
  it("fills in a default name and trims", () => {
    expect(normalizeRoute(draft({ from: "  Hamlet ", notes: " ford above the mill " }))).toEqual({
      name: "Hamlet - Golden Boar",
      from: "Hamlet",
      to: "Golden Boar",
      quarters: 3,
      bothWays: true,
      notes: "ford above the mill",
    });
    expect(defaultRouteName("", "X")).toBe("? - X");
  });
  it("rejects missing places, the same place twice, and less than 1 Quarter", () => {
    expect(validateRoute(draft())).toBeNull();
    expect(validateRoute(draft({ to: " " }))).toBe("Enter both places.");
    expect(validateRoute(draft({ to: "hamlet" }))).toBe("A route needs two different places.");
    expect(validateRoute(draft({ quarters: 0 }))).toBe("Recorded Route Time must be at least 1 Quarter.");
    expect(validateRoute(draft({ quarters: 1.5 }))).not.toBeNull();
  });
  it("label text shows name, time, and one-way routes", () => {
    expect(routeLabelText(normalizeRoute(draft({ name: "Mill road" })))).toBe("Mill road · 3 Quarters");
    expect(routeLabelText(normalizeRoute(draft({ name: "River", quarters: 1, bothWays: false })))).toBe("River · 1 Quarter (one way)");
  });
});

describe("reading routes back from map labels", () => {
  it("round-trips what was stored", () => {
    const stored = normalizeRoute(draft({ name: "Mill road", notes: "n" }));
    expect(routeFromMetadata("label-1", stored)).toEqual({ id: "label-1", ...stored });
  });
  it("ignores labels that aren't routes, and fills fields added later", () => {
    expect(routeFromMetadata("x", undefined)).toBeNull();
    expect(routeFromMetadata("x", { from: "A" })).toBeNull();
    expect(routeFromMetadata("x", { from: "A", to: "B", quarters: 2 })).toEqual({
      id: "x", name: "A - B", from: "A", to: "B", quarters: 2, bothWays: true, notes: "",
    });
  });
});

describe("finding recorded routes", () => {
  const routes = [
    route("a", { name: "Mill road" }),
    route("b", { name: "Ridge path", quarters: 5 }),
    route("c", { name: "River", from: "Golden Boar", to: "Dunmere", bothWays: false }),
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
  });
  it("blank places never match", () => {
    expect(routesBetween(routes, "", "")).toEqual([]);
    expect(destinationsFrom(routes, "")).toEqual([]);
  });
});
