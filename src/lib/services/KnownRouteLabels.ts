import OBR, { buildLabel, isLabel } from "@owlbear-rodeo/sdk";
import type { Item } from "@owlbear-rodeo/sdk";
import { writable } from "svelte/store";
import { normalizeRoute, routeFromMetadata, routeLabelText } from "../knownRoutes";
import type { KnownRouteRecord, NewKnownRoute } from "../knownRoutes";

// Known Routes live on map labels in the current Owlbear scene (V-006): one
// label per route, its details in that label's metadata. Moving the label
// is fine; deleting it from the map deletes the route (§11.1.5). Routes
// belong to the scene they're on - open that scene to use them.

const ROUTE_KEY = "rodeo.owlbear.reforged-sheet/known-route";

export const KnownRoutesStore = writable<KnownRouteRecord[]>([]);
export const RouteSceneReadyStore = writable(false);

let initialized = false;

function readRoutes(items: Item[]): KnownRouteRecord[] {
  return items
    .map((item) => routeFromMetadata(item.id, item.metadata[ROUTE_KEY]))
    .filter((route): route is KnownRouteRecord => route !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function refresh() {
  const ready = await OBR.scene.isReady();
  RouteSceneReadyStore.set(ready);
  KnownRoutesStore.set(ready ? readRoutes(await OBR.scene.items.getItems()) : []);
}

export function initKnownRouteLabels(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;
  OBR.scene.onReadyChange(() => void refresh());
  OBR.scene.items.onChange((items) => KnownRoutesStore.set(readRoutes(items)));
  void refresh();
}

// GM: put a new route label in the middle of the current view.
export async function addKnownRoute(route: NewKnownRoute): Promise<void> {
  const data = normalizeRoute(route);
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  const position = await OBR.viewport.inverseTransformPoint({ x: width / 2, y: height / 2 });
  const label = buildLabel()
    .plainText(routeLabelText(data))
    .position(position)
    .layer("TEXT")
    .name(`Known Route: ${data.name}`)
    .metadata({ [ROUTE_KEY]: data })
    .build();
  await OBR.scene.items.addItems([label]);
}

export async function updateKnownRoute(id: string, route: NewKnownRoute): Promise<void> {
  const data = normalizeRoute(route);
  await OBR.scene.items.updateItems(
    (item) => item.id === id,
    (drafts) => {
      for (const draft of drafts) {
        draft.metadata[ROUTE_KEY] = data;
        draft.name = `Known Route: ${data.name}`;
        if (isLabel(draft)) draft.text.plainText = routeLabelText(data);
      }
    },
  );
}

export async function deleteKnownRoute(id: string): Promise<void> {
  await OBR.scene.items.deleteItems([id]);
}
