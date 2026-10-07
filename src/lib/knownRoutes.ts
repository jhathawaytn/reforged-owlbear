// Known Routes (§11.1, V-006). Each route is a label on the Owlbear map, and
// the route's details live in that label's own metadata - "write it on the
// Company's map" taken literally. Per-item storage means a hex crawl with
// a hundred routes never touches the room's small shared metadata. The
// plumbing is services/KnownRouteLabels.ts; this file is pure and tested.

export type KnownRouteRecord = {
  id: string; // the map label's item id
  name: string;
  from: string;
  to: string;
  // Recorded Route Quarters (§11.3): worked out once and written on the
  // Company's map. Journey modifiers never change it.
  quarters: number;
  // Most routes can be walked either way; the GM can mark one-way edges.
  bothWays: boolean;
  notes: string;
};

export type NewKnownRoute = Omit<KnownRouteRecord, "id">;

function place(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function samePlace(a: string, b: string): boolean {
  return place(a) !== "" && place(a) === place(b);
}

export function defaultRouteName(from: string, to: string): string {
  return `${from.trim() || "?"} - ${to.trim() || "?"}`;
}

// Every recorded route that goes from `from` to `to` (a two-way route also
// matches in reverse, so a route recorded on the way out serves the trip home).
export function routesBetween(routes: KnownRouteRecord[], from: string, to: string): KnownRouteRecord[] {
  return routes.filter(
    (route) =>
      (samePlace(route.from, from) && samePlace(route.to, to)) ||
      (route.bothWays && samePlace(route.from, to) && samePlace(route.to, from)),
  );
}

// Places reachable by a Known Route from `from` (for the destination picker).
export function destinationsFrom(routes: KnownRouteRecord[], from: string): string[] {
  const out = new Map<string, string>();
  for (const route of routes) {
    if (samePlace(route.from, from)) out.set(place(route.to), route.to.trim());
    else if (route.bothWays && samePlace(route.to, from)) out.set(place(route.from), route.from.trim());
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b));
}

export function validateRoute(route: NewKnownRoute): string | null {
  if (!route.from.trim() || !route.to.trim()) return "Enter both places.";
  if (samePlace(route.from, route.to)) return "A route needs two different places.";
  if (!Number.isInteger(route.quarters) || route.quarters < 1) return "Recorded Route Time must be at least 1 Quarter.";
  return null;
}

// Trim and fill the default name - what actually gets stored on the label.
export function normalizeRoute(route: NewKnownRoute): NewKnownRoute {
  return {
    name: route.name.trim() || defaultRouteName(route.from, route.to),
    from: route.from.trim(),
    to: route.to.trim(),
    quarters: Math.floor(Number(route.quarters)),
    bothWays: route.bothWays,
    notes: route.notes.trim(),
  };
}

// What the map label says.
export function routeLabelText(route: NewKnownRoute): string {
  return `${route.name} · ${route.quarters} Quarter${route.quarters === 1 ? "" : "s"}${route.bothWays ? "" : " (one way)"}`;
}

// Read a label's stored route; anything malformed is ignored.
export function routeFromMetadata(id: string, raw: unknown): KnownRouteRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<NewKnownRoute>;
  if (typeof data.from !== "string" || typeof data.to !== "string" || typeof data.quarters !== "number") return null;
  return {
    id,
    name: typeof data.name === "string" && data.name ? data.name : defaultRouteName(data.from, data.to),
    from: data.from,
    to: data.to,
    quarters: data.quarters,
    bothWays: data.bothWays ?? true,
    notes: typeof data.notes === "string" ? data.notes : "",
  };
}
