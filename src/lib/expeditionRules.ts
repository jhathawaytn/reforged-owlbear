// Pure Expedition rules math, pulled out of ExpeditionView.svelte so it can
// be unit-tested (see expeditionRules.test.ts). No Svelte, no OBR.
import type { RouteMode, TravelPace, TravelQuarter, WildernessActivity } from "./model/ExpeditionStore";

// §11.8.2 - Known Route whole-journey Event budget, by recorded travel time.
export function knownRouteBaseRange(routeTimeQuarters: number): { min: number; max: number } {
  if (routeTimeQuarters <= 0) return { min: 0, max: 0 };
  if (routeTimeQuarters <= 2) return { min: 0, max: 1 };
  if (routeTimeQuarters <= 7) return { min: 1, max: 2 };
  return { min: 2, max: 3 };
}

// §11.8.2 - "Add 1 if the route is contested, seasonally dangerous, or long
// untraveled. If the Company commits to Cautious Pace for the whole journey,
// reduce the budget by 1, minimum 0." The GM's pick from the table is stored
// as the base; the modifiers are applied here, never baked into the stored
// number, so toggling a modifier on and back off is always exact.
export function knownRouteModifier(dangerous: boolean, cautiousCommitment: boolean): number {
  return (dangerous ? 1 : 0) - (cautiousCommitment ? 1 : 0);
}

export function effectiveKnownRouteBudget(
  baseBudget: number,
  dangerous: boolean,
  cautiousCommitment: boolean,
): number {
  if (baseBudget < 0) return -1; // not chosen yet
  return Math.max(0, baseBudget + knownRouteModifier(dangerous, cautiousCommitment));
}

export function knownRouteEventsRemaining(effectiveBudget: number, resolved: number): number {
  if (effectiveBudget < 0) return 0;
  return Math.max(0, effectiveBudget - resolved);
}

// Older saves stored the budget with the modifiers already applied. Recover
// the base the GM most likely picked (exact unless the 0 floor was hit).
export function legacyBaseBudget(storedBudget: number, dangerous: boolean, cautiousCommitment: boolean): number {
  if (storedBudget < 0) return -1;
  return Math.max(0, storedBudget - knownRouteModifier(dangerous, cautiousCommitment));
}

// §11.8.2 - "Declaring Cautious Pace for only part of the journey does not
// reduce the whole-journey budget." Declaring any other Pace on a Known Route
// breaks a whole-journey Cautious commitment.
export function declaringPaceBreaksCautiousCommitment(
  routeMode: RouteMode,
  cautiousCommitment: boolean,
  pace: TravelPace,
): boolean {
  return routeMode === "Known Route" && cautiousCommitment && pace !== "Cautious";
}

// The ordinary day (§11, "Ordinary day: Travel · Travel · Make Camp · Sleep").
// These are only defaults for the Quarter plan; the GM can change any of them.
export function defaultActivityForQuarter(q: TravelQuarter): WildernessActivity {
  if (q === "Morning" || q === "Day") return "Travel";
  if (q === "Evening") return "Make Camp";
  return "Sleep";
}
