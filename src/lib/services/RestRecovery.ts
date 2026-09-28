import { get } from "svelte/store";
import { PlayerCharacterStore, clearDeprivationCause } from "../model/ReforgedCharacter";
import type { Attribute, ReforgedCharacter, UsageDieState } from "../types";
import { ATTRIBUTES, DIE_SIDES, stepDownDie } from "../types";
import type { RestQuality } from "../model/ExpeditionStore";
import { rollSingleDie } from "./DicePlus";
import { notify } from "./Notifier";

export type RestResolution = {
  quality: RestQuality;
  fatigueRemoved: number;
  healedLightInjuries: number;
  restoredAttribute?: Attribute;
  attributeRestorationBlockedByDeprived: boolean;
  dazedCleared: boolean;
  medicalNote?: string;
};

function cloneCharacter(pc: ReforgedCharacter): ReforgedCharacter {
  return {
    ...pc,
    attributes: { ...pc.attributes },
    attributeMax: { ...pc.attributeMax },
    gear: pc.gear.map((item) => ({ ...item })),
    conditions: [...pc.conditions],
    deprivationCauses: [...pc.deprivationCauses],
    injuries: pc.injuries.map((injury) => ({ ...injury })),
  };
}

export function lostAttributes(pc: ReforgedCharacter): Attribute[] {
  return ATTRIBUTES.filter((attribute) => pc.attributes[attribute] < pc.attributeMax[attribute]);
}

// Chapter 14 Rest quality is separate from Catch Your Breath.
// Rest does not automatically restore HP, consume Water, or satisfy food/water.
// A completed Sleep Quarter supplies the "full night's rest" requirement for
// ordinary Light Injury recovery when appropriate Medical supplies exist.
export async function resolveRestForCurrentCharacter(
  quality: RestQuality,
  restoreAttribute?: Attribute,
): Promise<RestResolution> {
  let pc = cloneCharacter(get(PlayerCharacterStore));

  // Satisfying Rest clears only the Rest deprivation cause. Food/Water/other
  // causes remain independently capable of sustaining Deprived.
  pc = clearDeprivationCause(pc, "Rest");

  const dazedCleared = pc.conditions.includes("Dazed");
  if (dazedCleared) {
    pc.conditions = pc.conditions.filter((condition) => condition !== "Dazed");
  }

  let fatigueRemoved = 0;
  if (quality === "Normal" || quality === "Comfortable") {
    fatigueRemoved = pc.fatigue ?? 0;
    pc.fatigue = 0;
  }

  let healedLightInjuries = 0;
  let medicalNote: string | undefined;
  const lightInjuries = pc.injuries.filter((injury) => injury.severity === "Light");
  if (lightInjuries.length) {
    const medItem = pc.gear.find(
      (item) => item.usageKind === "Medical" && item.usageDie && item.usageDie !== "depleted",
    );
    if (medItem) {
      const size = medItem.usageDie as Exclude<UsageDieState, "depleted">;
      const roll = await rollSingleDie(DIE_SIDES[size], { rollTarget: "everyone", showResults: true });
      if (roll <= 3) {
        const stepped = stepDownDie(size);
        medItem.usageDie = stepped;
        medicalNote =
          stepped === "depleted"
            ? `${medItem.name} rolled ${roll} on ${size} and depleted after treatment.`
            : `${medItem.name} rolled ${roll} on ${size} and stepped down to ${stepped}.`;
      } else {
        medicalNote = `${medItem.name} rolled ${roll} on ${size} and held.`;
      }
      healedLightInjuries = lightInjuries.length;
      pc.injuries = pc.injuries.filter((injury) => injury.severity !== "Light");
    } else {
      medicalNote = "Light Injuries remain: no accessible Medical supplies.";
    }
  }

  let restoredAttribute: Attribute | undefined;
  let attributeRestorationBlockedByDeprived = false;
  if (quality === "Comfortable") {
    const available = lostAttributes(pc);
    const chosen = restoreAttribute && available.includes(restoreAttribute)
      ? restoreAttribute
      : available[0];

    if (chosen) {
      // Deprived blocks nonmagical Attribute restoration. At this point the
      // Rest cause has already been cleared, so any remaining Deprived state
      // is being sustained by Food, Water, or another cause.
      if (pc.conditions.includes("Deprived")) {
        attributeRestorationBlockedByDeprived = true;
      } else {
        pc.attributes[chosen] = Math.min(pc.attributeMax[chosen], pc.attributes[chosen] + 1);
        restoredAttribute = chosen;
      }
    }
  }

  PlayerCharacterStore.set(pc);

  const pieces = [`${quality} Rest resolved.`];
  if (fatigueRemoved) pieces.push(`${fatigueRemoved} Fatigue removed.`);
  if (healedLightInjuries) pieces.push(`${healedLightInjuries} Light Injury(ies) healed.`);
  if (restoredAttribute) pieces.push(`${restoredAttribute} restored by 1.`);
  if (attributeRestorationBlockedByDeprived) {
    pieces.push("Comfortable Rest Attribute recovery blocked while Deprived.");
  }
  if (dazedCleared) pieces.push("Dazed cleared.");
  if (medicalNote) pieces.push(medicalNote);
  notify(pieces.join(" "));

  return {
    quality,
    fatigueRemoved,
    healedLightInjuries,
    restoredAttribute,
    attributeRestorationBlockedByDeprived,
    dazedCleared,
    medicalNote,
  };
}
