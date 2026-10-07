<script lang="ts">
  import Modal from "./Modal.svelte";
  import RollButton from "./RollButton.svelte";
  import { PlayerCharacterStore as pc, totalArmor, resolveDeflectStep, canUseTechnique, useTechnique, isOverburdened } from "../model/ReforgedCharacter";
  import { hasArmorProperty, INJURY_SITE_TABLE, SCAR_TABLE, DAMAGE_TYPES } from "../types";
  import type { Attack, DamageType, DieSize, GearItem, InjuryLocation, InjurySeverity } from "../types";
  import { DIE_SIDES } from "../types";
  import { newId } from "../utils";
  import { rollNotation, rollSingleDie } from "../services/DicePlus";
  import { notify } from "../services/Notifier";
  import { markDead } from "../lifeState";
  import type { SaveRollResult } from "../utils";

  let showModal = false;

  // Follows the book's own Reaction Sequence (§13.7), Damage Sequence
  // (§13.10), and HP-to-STR chain (§14.18 Quick Reference) step for step.
  // Gambits and Techniques still aren't wired up - for now the player enters
  // the resulting damage number by hand.
  type Phase = "clinging" | "reaction" | "entry" | "parry" | "shieldSacrifice" | "deflect" | "holdFast" | "scar" | "strOverflow" | "criticalSave" | "resolved";
  let phase: Phase = "reaction";

  type Reaction = "Defend" | "Block" | "Dodge" | "Parry" | "FightBack" | "ShieldSacrifice";
  const REACTIONS: { id: Reaction; label: string; strain: number }[] = [
    { id: "Defend", label: "Defend", strain: 0 },
    { id: "Block", label: "Block", strain: 1 },
    { id: "Dodge", label: "Dodge", strain: 1 },
    { id: "Parry", label: "Parry", strain: 1 },
    { id: "FightBack", label: "Fight Back", strain: 1 },
    { id: "ShieldSacrifice", label: "Shield Sacrifice (decide after seeing damage)", strain: 0 },
  ];
  let reaction: Reaction | null = null;
  let useDefensiveManeuvering = false;
  let pendingHoldFastRemaining = 0;

  let damage = 0;
  let damageType: DamageType = "Slashing";
  let dieSize: DieSize = "d4";
  let ignoresArmor = false;

  let parryAttackerRoll = 0;
  let parrySelectedAttack: Attack | null = null;
  let parryManualRoll = 0;
  let parryDefenderRoll: number | null = null;

  let afterArmor = 0;
  let deflectItem: GearItem | null = null;
  let deflectAmount = 0;
  let overflow = 0;
  let strBefore = 0;
  let mortalWoundQualifies = false;
  let scarResult: (typeof SCAR_TABLE)[number] | null = null;
  let resultLog = "";

  function reset() {
    phase = "reaction";
    reaction = null;
    useDefensiveManeuvering = false;
    pendingHoldFastRemaining = 0;
    damage = 0;
    damageType = "Slashing";
    dieSize = "d4";
    ignoresArmor = false;
    parryAttackerRoll = 0;
    parrySelectedAttack = null;
    parryManualRoll = 0;
    parryDefenderRoll = null;
    afterArmor = 0;
    deflectItem = null;
    deflectAmount = 0;
    overflow = 0;
    mortalWoundQualifies = false;
    scarResult = null;
    resultLog = "";
  }

  function open() {
    reset();
    // §14.7: any damage while Clinging kills, before Armor - skip the chain.
    if ($pc.conditions.includes("Clinging")) phase = "clinging";
    showModal = true;
  }

  function confirmClingingDeath() {
    const who = $pc.name || "A character";
    $pc = markDead($pc);
    log("Damage while Clinging: dies immediately (before Armor, no Save).");
    notify(`${who} took damage while Clinging and is dead.`);
    phase = "resolved";
  }

  function isFunctional(item: GearItem): boolean {
    return item.condition !== "Broken" && item.condition !== "Destroyed";
  }

  $: shieldOptions = $pc.gear.filter(
    (g) => hasArmorProperty(g, "Shield Sacrifice") && g.zone === "Hand" && g.equipped && isFunctional(g),
  );
  $: blockShieldOptions = $pc.gear.filter(
    (g) =>
      (g.name === "Shield" || g.name === "Buckler") &&
      g.zone === "Hand" &&
      g.equipped &&
      isFunctional(g),
  );
  $: usableWeaponGear = $pc.gear.filter(
    (g) => g.durableCategory === "Weapon" && g.zone === "Hand" && g.equipped && isFunctional(g),
  );
  $: deflectOptions = $pc.gear.filter(
    (g) => g.durableCategory === "Armor" && g.equipped && isFunctional(g),
  );
  $: helmOptions = $pc.gear.filter(
    (g) => hasArmorProperty(g, "Helm Sacrifice") && g.equipped && isFunctional(g),
  );

  function reactionUnavailableReason(r: Reaction): string {
    // Only block a Reaction when the sheet can prove it is unavailable.
    // Fictional constraints (room to Dodge, Surprise, terrain, etc.) remain
    // the GM/player's call under §13.7.8.
    if (r === "ShieldSacrifice" && shieldOptions.length === 0) {
      return "Requires a functional full Shield in Hand.";
    }
    if (r === "Block" && blockShieldOptions.length === 0 && usableWeaponGear.length === 0) {
      return "Requires a functional Shield/Buckler or suitable weapon in Hand.";
    }
    if (r === "Parry" && usableWeaponGear.length === 0) {
      return "Requires a functional weapon in Hand.";
    }
    return "";
  }

  // Sacrifice always means Destroyed - it bypasses Condition steps, Quality
  // protection, and Masterwork Reserve entirely (§9.3.1), unlike an ordinary
  // Deflect step.
  function sacrifice(item: GearItem) {
    item.condition = "Destroyed";
    $pc.gear = $pc.gear;
  }

  function log(msg: string) {
    resultLog = resultLog ? `${resultLog}\n${msg}` : msg;
    notify(msg);
  }

  // ---- Reaction (§13.7) - chosen before damage is rolled, except Shield
  // Sacrifice which is decided after (§9.5.5) - one Reaction per incoming
  // Action. ----
  function selectReaction(r: Reaction) {
    const unavailable = reactionUnavailableReason(r);
    if (unavailable) {
      notify(`${r} unavailable: ${unavailable}`);
      return;
    }
    reaction = r;
    const cfg = REACTIONS.find((x) => x.id === r)!;
    const isEligibleForManeuvering = r === "Block" || r === "Dodge" || r === "Parry" || r === "FightBack";
    if (useDefensiveManeuvering && isEligibleForManeuvering && canUseTechnique($pc, "Defensive Maneuvering")) {
      useTechnique($pc, "Defensive Maneuvering");
      $pc = $pc;
      const reduced = Math.max(0, cfg.strain - 1);
      if (reduced > 0) $pc.strain += reduced;
      log(`${cfg.label}: ${reduced} Strain (Defensive Maneuvering: ${cfg.strain} - 1).`);
    } else if (cfg.strain > 0) {
      $pc.strain += cfg.strain;
      log(`${cfg.label}: ${cfg.strain} Strain.`);
    }
    if (r === "FightBack") {
      log("Fight Back: resolve the incoming attack normally, then make one free melee Action against the attacker (no Defensive Reaction against that counterattack).");
    }
    phase = r === "Parry" ? "parry" : "entry";
  }

  async function rollBlockDodgeDie() {
    damage = await rollSingleDie(4);
    log(`${reaction}: replaces the attacker's weapon die - rolled 1d4 = ${damage}.`);
  }

  // ---- Entry ----
  function submitEntry() {
    if (reaction === "ShieldSacrifice" && shieldOptions.length) {
      phase = "shieldSacrifice";
    } else {
      resolveArmor();
    }
  }

  // ---- Parry (§13.7.5) - a wholly separate path: both sides roll their
  // weapon damage, the higher result wins, and the loser takes the winner's
  // roll straight to STR - ignoring Armor and HP, and never causing a
  // Mortal Wound, Scar, or Critical Save. A tie is no exchange. ----
  async function rollParryDefense() {
    if (parrySelectedAttack) {
      const result = await rollNotation(parrySelectedAttack.roll);
      if (!result) {
        notify(`Parry: couldn't parse "${parrySelectedAttack.roll}" - enter a number by hand instead.`);
        return;
      }
      parryDefenderRoll = result.total;
      log(`Parry: your ${parrySelectedAttack.name || "weapon"} rolls ${result.breakdown}.`);
    } else {
      parryDefenderRoll = parryManualRoll;
      log(`Parry: your weapon rolls ${parryDefenderRoll}.`);
    }
  }

  function resolveParryContest() {
    if (parryDefenderRoll === null) return;
    strBefore = $pc.attributes.STR;
    // [reserved] a death-prevention interrupt would resolve here, before
    // STR actually reaches 0.
    if (parryAttackerRoll > parryDefenderRoll) {
      const newSTR = Math.max(0, strBefore - parryAttackerRoll);
      $pc.attributes.STR = newSTR;
      log(
        `Parry lost: attacker's ${parryAttackerRoll} beats your ${parryDefenderRoll}. STR ${strBefore} -> ${newSTR} (ignores Armor/HP, no Critical Save/Mortal Wound/Scar).`,
      );
      // Rules V0.5 gap: Parry damage can't cause a Mortal Wound (§13.7.5), and
      // §14.6 has no "STR 0 = death" rule for Damage. Don't invent one.
      if (newSTR <= 0) {
        log("STR 0 from a Parry: the rules (V0.5) don't say what happens - Parry can't cause a Mortal Wound. GM decides.");
        notify(`${$pc.name || "A character"} hit STR 0 from a lost Parry - GM decides the outcome.`);
      }
    } else if (parryAttackerRoll < parryDefenderRoll) {
      log(`Parry won: your ${parryDefenderRoll} beats the attacker's ${parryAttackerRoll}. No damage to you.`);
    } else {
      log(`Parry tied at ${parryAttackerRoll} - no clear winner, no exchange.`);
    }
    phase = "resolved";
  }

  // ---- Shield Sacrifice (§9.5.5) - after damage is rolled, before it's
  // applied. Only a full Shield qualifies; Bucklers are excluded via the
  // Shield Sacrifice property itself. ----
  function useShieldSacrifice(item: GearItem) {
    sacrifice(item);
    log(`Shield Sacrifice: destroyed ${item.name} to negate all ${damage} damage from this Action.`);
    phase = "resolved";
  }
  function declineShieldSacrifice() {
    resolveArmor();
  }

  // ---- Armor (§13.10.2) - automatic, not a choice. ----
  function resolveArmor() {
    const armor = totalArmor($pc);
    afterArmor = ignoresArmor ? damage : Math.max(0, damage - armor);
    if (ignoresArmor) {
      log(`Damage ignores Armor: ${damage} damage carries forward unreduced.`);
    } else {
      log(`Armor: ${damage} - A${armor} = ${afterArmor} remaining.`);
    }
    if (afterArmor <= 0) {
      log("Fully absorbed by Armor.");
      phase = "resolved";
      return;
    }
    if (deflectOptions.length) {
      phase = "deflect";
    } else {
      maybeOfferHoldFast(afterArmor);
    }
  }

  // ---- Deflect (§13.10.3, §9.5.4, §9.5.7) ----
  $: deflectMax = Math.min(2, afterArmor);
  $: deflectIsDeflective = !!deflectItem && hasArmorProperty(deflectItem, "Deflective");
  function submitDeflect() {
    if (deflectItem && deflectAmount > 0) {
      const steps = deflectIsDeflective ? 1 : deflectAmount;
      for (let i = 0; i < steps; i++) resolveDeflectStep($pc, deflectItem);
      $pc.gear = $pc.gear;
      $pc = $pc;
      log(
        `Deflect: prevented ${deflectAmount} damage with ${deflectItem.name} (${steps} Condition step${steps === 1 ? "" : "s"}${deflectIsDeflective ? ", Deflective" : ""}).`,
      );
    }
    maybeOfferHoldFast(afterArmor - deflectAmount);
  }

  // ---- Hold Fast (Technique, Fray only) - "after Armor and Deflect have
  // been resolved, but before damage is applied" is exactly this moment. ----
  function maybeOfferHoldFast(remaining: number) {
    if (remaining > 0 && $pc.combatActive && $pc.combatStage === "Fray" && canUseTechnique($pc, "Hold Fast")) {
      pendingHoldFastRemaining = remaining;
      phase = "holdFast";
    } else {
      applyToHP(remaining);
    }
  }
  function useHoldFast() {
    useTechnique($pc, "Hold Fast");
    $pc = $pc;
    const reduced = Math.max(0, pendingHoldFastRemaining - 3);
    log(`Hold Fast: remaining damage ${pendingHoldFastRemaining} -> ${reduced}.`);
    applyToHP(reduced);
  }
  function skipHoldFast() {
    applyToHP(pendingHoldFastRemaining);
  }

  // ---- HP / STR overflow (§13.10.5-13.10.6, §14.18) ----
  function applyToHP(remaining: number) {
    // Overburdened (Appendix A): HP counts as 0 and damage strikes STR
    // directly. The stored HP is left untouched underneath, matching the HP
    // box, and shows again once the character is no longer Overburdened.
    if (isOverburdened($pc)) {
      overflow = remaining;
      log(`Overburdened: HP counts as 0 (${$pc.hitPoints} kept for later), so all ${remaining} damage strikes STR.`);
      if (overflow === 0) {
        phase = "resolved";
        return;
      }
      continueToStr();
      return;
    }
    const hp = $pc.hitPoints;
    const newHP = Math.max(0, hp - remaining);
    overflow = Math.max(0, remaining - hp);
    $pc.hitPoints = newHP;
    log(`HP: ${hp} -> ${newHP}${overflow ? `, ${overflow} damage overflows into STR` : ""}.`);

    if (overflow === 0) {
      if (newHP === 0) {
        phase = "scar";
      } else {
        phase = "resolved";
      }
      return;
    }

    continueToStr();
  }

  function continueToStr() {
    // Edge-Proof (§9.5.4): Slashing/Piercing overflow is reduced by 1 (min
    // 0); doesn't apply when the attack ignores Armor.
    if (!ignoresArmor && (damageType === "Slashing" || damageType === "Piercing")) {
      const edgeProof = $pc.gear.some((g) => hasArmorProperty(g, "Edge-Proof"));
      if (edgeProof && overflow > 0) {
        const before = overflow;
        overflow = Math.max(0, overflow - 1);
        log(`Edge-Proof: ${damageType} overflow reduced ${before} -> ${overflow}.`);
      }
    }

    strBefore = $pc.attributes.STR;
    mortalWoundQualifies = overflow >= Math.ceil(strBefore / 2);
    phase = "strOverflow";
  }

  function resolveStrOverflow() {
    // [reserved] a death-prevention interrupt would resolve here, before
    // STR actually reaches 0 (§14.18 step 5).
    const newSTR = Math.max(0, strBefore - overflow);
    $pc.attributes.STR = newSTR;
    log(`STR: ${strBefore} -> ${newSTR}.`);

    // Rules V0.5 §14.6: STR Damage reaching 0 always qualifies as a Mortal
    // Wound (it's at least half current STR) and can still be stabilized -
    // there's no separate "STR 0 = slain" rule for Damage any more.
    if (mortalWoundQualifies) {
      const who = $pc.name || "A character";
      if ($pc.doomActive) {
        $pc = markDead($pc);
        log("Doom: a Mortal Wound this session cannot be stabilized. Dead.");
        notify(`${who} is dead (Doom + Mortal Wound).`);
        phase = "resolved";
        return;
      }
      if ($pc.mortalWound) {
        $pc = markDead($pc);
        log("Second Mortal Wound before stabilization - dies immediately.");
        notify(`${who} is dead (second Mortal Wound).`);
        phase = "resolved";
        return;
      }
      $pc.mortalWound = true;
      log("Mortal Wound: dies in one hour unless stabilized. The GM confirms stabilization from the banner.");
      notify(`${who} is MORTALLY WOUNDED - dies in 1 hour unless stabilized!`);
      phase = "resolved";
      return;
    }

    // Ordinary Critical STR Save, using the real RollButton (broadcasts,
    // supports Advantage/Disadvantage) - target is the already-reduced STR.
    phase = "criticalSave";
  }

  async function onCriticalSaveRolled(e: CustomEvent<SaveRollResult>) {
    if (!e.detail.success) {
      const site = INJURY_SITE_TABLE[(await rollSingleDie(10)) - 1];
      addInjury("Severe", site.location, `Critical Damage - ${site.site}`);
      log(`Critical STR Save failed: Severe ${site.location} Injury (${site.site}).`);
    } else {
      log("Critical STR Save succeeded: STR loss stands, no further Critical Damage.");
    }
    phase = "resolved";
  }

  function addInjury(severity: InjurySeverity, location: InjuryLocation, notes: string) {
    $pc.injuries = [...$pc.injuries, { id: newId(), severity, location, notes }];
  }

  // ---- Scar (§14.2) - HP emptied to exactly 0 with no overflow. Attribute
  // loss here is NOT Damage: no Critical Save, no Mortal Wound, no further
  // Scar - STR reaching 0 this way is Attribute Loss: incapacitated, not
  // dead (§14.6, rules V0.5). ----
  async function rollTheScar() {
    const roll = await rollSingleDie(DIE_SIDES[dieSize]);
    const entry = SCAR_TABLE[roll - 1];
    scarResult = entry;
    log(`Scar (d${DIE_SIDES[dieSize]}): rolled ${roll} - ${entry.name}. ${entry.effect}`);
    await applyScar(entry.roll);
  }

  function applyScarAttributeLoss(attr: "STR" | "WIL", amount: number) {
    const before = $pc.attributes[attr];
    const after = Math.max(0, before - amount);
    $pc.attributes[attr] = after;
    log(`${attr}: ${before} -> ${after} (Scar - not Damage, no Critical Save/Mortal Wound/further Scar).`);
    if (attr === "STR" && after <= 0) {
      log("STR 0 from a Scar: incapacitated, not dead (§14.6). Stays incapacitated until STR is above 0.");
      notify(`${$pc.name || "A character"} is incapacitated (STR 0 from a Scar).`);
    }
  }

  async function applyScar(roll: number, replacedDoom = false) {
    switch (roll) {
      case 1:
        applyScarAttributeLoss("WIL", await rollSingleDie(6));
        break;
      case 2:
        applyScarAttributeLoss("WIL", 1);
        log("Gain a permanent visible mark appropriate to the blow (record it in Notes).");
        break;
      case 3:
        applyScarAttributeLoss("STR", await rollSingleDie(4));
        break;
      case 4:
        $pc.fatigue += 1;
        $pc.impairedNextAction = true;
        log("Gain 1 Fatigue; next Action is Impaired (clear that flag by hand once it's used).");
        break;
      case 5:
        applyScarAttributeLoss("STR", await rollSingleDie(6));
        break;
      case 6: {
        const site = INJURY_SITE_TABLE[(await rollSingleDie(10)) - 1];
        addInjury("Light", site.location, `Scar: Gouge - ${site.site}`);
        log(`Light ${site.location} Injury (${site.site}).`);
        break;
      }
      case 7:
        addInjury("Severe", "Head", "Scar: Concussion");
        log("Severe Head Injury.");
        break;
      case 8: {
        const site = INJURY_SITE_TABLE[(await rollSingleDie(10)) - 1];
        addInjury("Severe", site.location, `Scar: Tear - ${site.site}`);
        log(`Severe ${site.location} Injury (${site.site}).`);
        break;
      }
      case 9:
        applyScarAttributeLoss("STR", await rollSingleDie(4));
        applyScarAttributeLoss("WIL", await rollSingleDie(4));
        break;
      case 10: {
        const site = INJURY_SITE_TABLE[(await rollSingleDie(10)) - 1];
        addInjury("Permanent", site.location, `Scar: Mutilation - ${site.site}`);
        log(`Permanent ${site.location} Injury (${site.site}).`);
        break;
      }
      case 11:
        if (!replacedDoom) {
          $pc.doomActive = true;
          log("Doom: if you suffer a Mortal Wound later this session, you cannot be stabilized (manually cleared at session end).");
        }
        break;
      case 12:
        $pc.temperedPending = true;
        log("Tempered: the next time you gain a Level, roll HP Growth twice and keep the higher result, then this clears.");
        break;
    }
    if (roll !== 11 || replacedDoom) {
      $pc.scars = [...$pc.scars, { id: newId(), roll: scarResult?.roll ?? roll, name: scarResult?.name ?? "", note: "" }];
      phase = "resolved";
    }
    // roll === 11 (Doom) stays in "scar" phase so Helm Sacrifice can still
    // be offered before logging/finalizing.
  }

  function finalizeDoom() {
    $pc.scars = [...$pc.scars, { id: newId(), roll: 11, name: "Doom", note: "" }];
    phase = "resolved";
  }

  async function useHelmSacrifice(item: GearItem) {
    sacrifice(item);
    log(`Helm Sacrifice: destroyed ${item.name} to suffer Agony instead of Doom.`);
    scarResult = { ...SCAR_TABLE[8], name: "Agony (via Helm Sacrifice)" };
    await applyScar(9, true);
  }
</script>

<button class="bg-black text-white rounded-md text-sm px-2" on:click={open}>Take Damage</button>

<Modal bind:showModal vw={45}>
  <h1 slot="header">Take Damage</h1>
  <div class="w-full flex flex-col gap-2 text-sm">
    <div class="text-xs text-gray-500">
      Follows the Reaction Sequence (§13.7), Damage Sequence (§13.10), and HP-to-STR chain (§14.18) in order.
      Defensive Maneuvering and Hold Fast are offered automatically when eligible (Clash/Fray, via Combat).
    </div>

    {#if phase === "clinging"}
      <div class="border-2 border-purple-900 rounded-md p-2 bg-purple-50">
        <div class="font-bold text-purple-900">Clinging: any damage kills</div>
        <div class="text-xs mt-1">
          While Clinging, damage from any source or amount kills immediately. It resolves before Armor; no Save (§14.7).
        </div>
        <div class="flex gap-2 mt-2">
          <button class="bg-purple-900 text-white rounded-md px-2 py-1 text-xs" on:click={confirmClingingDeath}>
            Confirm: damage taken (dies)
          </button>
          <button class="border rounded-md px-2 py-1 text-xs" on:click={() => (showModal = false)}>Cancel - no damage</button>
        </div>
      </div>
    {/if}

    {#if phase === "reaction"}
      <div class="text-xs">Choose your Defensive Reaction (one per incoming Action):</div>
      {#if $pc.combatActive && $pc.combatStage === "Clash" && canUseTechnique($pc, "Defensive Maneuvering")}
        <label class="flex items-center gap-2 text-xs border rounded-md p-1">
          <input type="checkbox" class="w-auto" bind:checked={useDefensiveManeuvering} />
          Use Defensive Maneuvering (Technique) - -1 Strain on Block/Dodge/Parry/Fight Back
        </label>
      {/if}
      {#each REACTIONS as r (r.id)}
        {@const unavailable = reactionUnavailableReason(r.id)}
        <button
          class="border rounded-md px-2 py-1 text-xs text-left"
          class:bg-gray-100={!!unavailable}
          class:text-gray-400={!!unavailable}
          disabled={!!unavailable}
          title={unavailable || (r.strain ? `${r.strain} Strain` : "No Strain")}
          on:click={() => selectReaction(r.id)}
        >
          {r.label}{r.strain ? ` (${r.strain} Strain)` : ""}{unavailable ? " — unavailable" : ""}
        </button>
      {/each}
    {/if}

    {#if phase === "entry"}
      {#if reaction}
        <div class="text-xs bg-gray-100 rounded-md p-1">Reaction: <strong>{REACTIONS.find((r) => r.id === reaction)?.label}</strong></div>
      {/if}
      {#if reaction === "Block" || reaction === "Dodge"}
        <button class="border rounded-md px-2 py-1 text-xs" on:click={rollBlockDodgeDie}>
          Roll 1d4 (replaces the attacker's weapon die)
        </button>
      {/if}
      <label class="flex flex-col text-xs">
        Damage
        <input type="number" inputmode="numeric" min="0" bind:value={damage} class="w-24" />
      </label>
      <label class="flex flex-col text-xs">
        Damage Type
        <select bind:value={damageType}>
          {#each DAMAGE_TYPES as t}<option value={t}>{t}</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-2 text-xs">
        <input type="checkbox" class="w-auto" bind:checked={ignoresArmor} />
        This Action ignores Armor
      </label>
      <label class="flex flex-col text-xs" title="Only used if this hit empties HP to exactly 0 with no overflow (Scar, §14.2)">
        Incoming weapon's die (for a Scar, if this empties HP exactly)
        <select bind:value={dieSize}>
          <option value="d4">d4 (unarmed / none)</option>
          <option value="d6">d6</option>
          <option value="d8">d8</option>
          <option value="d10">d10</option>
          <option value="d12">d12</option>
        </select>
      </label>
      <button class="bg-black text-white rounded-md px-2 py-1" on:click={submitEntry}>Take Damage</button>
    {/if}

    {#if phase === "parry"}
      <div class="text-xs">
        Both sides roll their weapon damage; the higher result wins, and the loser takes the winner's roll straight
        to STR.
      </div>
      <label class="flex flex-col text-xs">
        Attacker's rolled damage
        <input type="number" inputmode="numeric" min="0" bind:value={parryAttackerRoll} class="w-24" />
      </label>
      {#if $pc.attacks.length}
        <label class="flex flex-col text-xs">
          Your weapon
          <select bind:value={parrySelectedAttack}>
            <option value={null}>- enter a number manually -</option>
            {#each $pc.attacks as a (a.id)}
              <option value={a}>{a.name || "(unnamed)"} ({a.roll})</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if !parrySelectedAttack}
        <label class="flex flex-col text-xs">
          Your rolled damage
          <input type="number" inputmode="numeric" min="0" bind:value={parryManualRoll} class="w-24" />
        </label>
      {/if}
      <button class="border rounded-md px-2 py-1 text-xs" on:click={rollParryDefense}>
        {parrySelectedAttack ? "Roll your weapon" : "Use this number"}
      </button>
      {#if parryDefenderRoll !== null}
        <div class="text-xs">Your roll: <strong>{parryDefenderRoll}</strong></div>
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={resolveParryContest}>
          Resolve Parry
        </button>
      {/if}
    {/if}

    {#if phase === "shieldSacrifice"}
      <div class="text-xs">Damage rolled: <strong>{damage}</strong>. Destroy a Shield to negate all of it?</div>
      {#each shieldOptions as item (item.id)}
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={() => useShieldSacrifice(item)}>
          Shield Sacrifice: destroy {item.name}
        </button>
      {/each}
      <button class="border rounded-md px-2 py-1 text-xs" on:click={declineShieldSacrifice}>Skip - apply Armor normally</button>
    {/if}

    {#if phase === "deflect"}
      <div class="text-xs">{afterArmor} damage remains after Armor. Deflect with one armor piece?</div>
      <select bind:value={deflectItem} class="text-xs">
        <option value={null}>- no Deflect -</option>
        {#each deflectOptions as item (item.id)}
          <option value={item}>{item.name} ({item.condition}{hasArmorProperty(item, "Deflective") ? ", Deflective" : ""})</option>
        {/each}
      </select>
      {#if deflectItem}
        <label class="flex flex-col text-xs">
          Prevent (0-{deflectMax})
          <input type="number" inputmode="numeric" min="0" max={deflectMax} bind:value={deflectAmount} class="w-24" />
        </label>
      {/if}
      <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={submitDeflect}>Continue</button>
    {/if}

    {#if phase === "holdFast"}
      <div class="text-xs">
        {pendingHoldFastRemaining} damage remains after Armor/Deflect. Use Hold Fast (Technique) to reduce it by 3?
      </div>
      <div class="flex gap-1">
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={useHoldFast}>
          Hold Fast ({pendingHoldFastRemaining} -&gt; {Math.max(0, pendingHoldFastRemaining - 3)})
        </button>
        <button class="border rounded-md px-2 py-1 text-xs" on:click={skipHoldFast}>Skip</button>
      </div>
    {/if}

    {#if phase === "scar" && !scarResult}
      <div class="text-xs">HP emptied to exactly 0 with no overflow - roll a Scar.</div>
      <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={rollTheScar}>Roll Scar (d{DIE_SIDES[dieSize]})</button>
    {/if}

    {#if phase === "scar" && scarResult?.roll === 11}
      <div class="text-xs">Rolled Doom. Destroy a functional Helm to suffer Agony instead?</div>
      {#each helmOptions as item (item.id)}
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={() => useHelmSacrifice(item)}>
          Helm Sacrifice: destroy {item.name}
        </button>
      {/each}
      <button class="border rounded-md px-2 py-1 text-xs" on:click={finalizeDoom}>Keep Doom</button>
    {/if}

    {#if phase === "strOverflow"}
      {#if mortalWoundQualifies}
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={resolveStrOverflow}>
          Resolve STR overflow ({$pc.doomActive ? "Doom" : $pc.mortalWound ? "2nd Mortal Wound" : "Mortal Wound"})
        </button>
      {:else}
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={resolveStrOverflow}>
          Apply STR loss ({strBefore} -> {Math.max(0, strBefore - overflow)})
        </button>
      {/if}
    {/if}

    {#if phase === "criticalSave"}
      <div class="text-xs">STR loss applied. Critical STR Save (target {$pc.attributes.STR}):</div>
      <RollButton label="STR" target={$pc.attributes.STR} on:rolled={onCriticalSaveRolled}>
        <div class="rounded-md bg-black text-white px-2 py-1 text-xs flex items-center gap-1">
          <i class="material-icons text-sm">casino</i> Critical STR Save
        </div>
      </RollButton>
    {/if}

    {#if resultLog}
      <pre class="text-xs whitespace-pre-wrap bg-gray-100 rounded-md p-2">{resultLog}</pre>
    {/if}

    {#if phase === "resolved"}
      <button class="border rounded-md px-2 py-1 text-xs" on:click={() => (showModal = false)}>Close</button>
    {/if}
  </div>
</Modal>
