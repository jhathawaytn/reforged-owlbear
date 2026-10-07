// Known Route ledger (§11.1, V-006). Known Routes outlive any one trip, so
// they live in the campaign record (model/CampaignStore.ts), not in the
// Expedition state that Arrival wipes. Pure functions only; tested.

export type KnownRouteRecord = {
  id: string;
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

export type RouteProblem = string | null;

export function validateRoute(route: NewKnownRoute): RouteProblem {
  if (!route.from.trim() || !route.to.trim()) return "Enter both places.";
  if (samePlace(route.from, route.to)) return "A route needs two different places.";
  if (!Number.isInteger(route.quarters) || route.quarters < 1) return "Recorded Route Time must be at least 1 Quarter.";
  return null;
}

export function addRoute(routes: KnownRouteRecord[], route: NewKnownRoute, id: string): KnownRouteRecord[] {
  return [
    ...routes,
    {
      ...route,
      id,
      name: route.name.trim() || defaultRouteName(route.from, route.to),
      from: route.from.trim(),
      to: route.to.trim(),
      notes: route.notes.trim(),
    },
  ];
}

export function updateRoute(routes: KnownRouteRecord[], id: string, patch: Partial<NewKnownRoute>): KnownRouteRecord[] {
  return routes.map((route) => (route.id === id ? { ...route, ...patch } : route));
}

// §11.1.5: a route destroyed or made unrecognizable reverts to Unmapped Country.
export function removeRoute(routes: KnownRouteRecord[], id: string): KnownRouteRecord[] {
  return routes.filter((route) => route.id !== id);
}
