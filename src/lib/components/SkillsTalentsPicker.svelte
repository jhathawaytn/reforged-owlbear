<script lang="ts">
  import { PlayerCharacterStore as pc, careerPicksTotal, careerPicksSpent } from "../model/ReforgedCharacter";
  import { CAREERS } from "../careers";
  import { TALENT_DESC } from "../talents";
  import type { CareerName } from "../careers";
  import {
    SKILL_TREE_NAMES,
    SKILL_TREE_NODE_NAMES,
    SKILL_TREE_NODE_DESC,
    TREE_CAREER_ACCESS,
    NODE_ORDER,
    NODE_XP_COST,
    nodePrerequisiteMet,
  } from "../skillTrees";
  import type { SkillTreeName, SkillNodeId } from "../skillTrees";
  import { newId } from "../utils";
  import type { GearItem } from "../types";
  import CareerQuestionnaire from "./CareerQuestionnaire.svelte";

  // "Free" intent per row (Career Pick during character creation) - only
  // matters at the moment ownership is toggled ON; not persisted as a
  // separate UI state, just read from the owned record once picked so the
  // checkbox reflects what actually happened.
  function pendingFreeKey(key: string) {
    return `pending:${key}`;
  }
  let pendingFree: Record<string, boolean> = {};

  // Only the first Career grants a Signature Weapon (§4.1); once added, it
  // can't be added again. Detected from Gear rather than a separate flag, so
  // it's always in sync with whatever's actually on the sheet.
  function hasSignatureWeapon(c: CareerName): boolean {
    return $pc.gear.some((g) => g.name === CAREERS[c].signatureWeapon.name);
  }

  // Each Career selected grants one Trinket - a petty item with no mechanical
  // effect (§4.2), rolled once per Career from that Career's own d4 table.
  function ownedTrinket(c: CareerName) {
    return $pc.trinkets.find((t) => t.career === c);
  }
  function rollTrinket(c: CareerName) {
    if (ownedTrinket(c)) return;
    const roll = Math.floor(Math.random() * 4) + 1;
    $pc.trinkets = [...$pc.trinkets, { career: c, text: CAREERS[c].trinkets[roll - 1] }];
  }

  function addSignatureWeapon(c: CareerName) {
    const sw = CAREERS[c].signatureWeapon;
    const gearId = newId();
    const gearItem: GearItem = {
      id: gearId,
      name: sw.name,
      zone: "Hand",
      slots: 1,
      equipped: true,
      durableCategory: "Weapon",
      quality: "Standard",
      condition: "Healthy",
      notes: sw.properties === "-" ? sw.special : `${sw.properties}. ${sw.special}`,
    };
    $pc.gear = [...$pc.gear, gearItem];
    $pc.attacks = [
      ...$pc.attacks,
      {
        id: newId(),
        name: sw.name,
        roll: sw.damageDie,
        notes: `${sw.damageType}${sw.properties !== "-" ? `, ${sw.properties}` : ""}`,
        gearId,
      },
    ];
  }

  // Only the first Career selected gets a Questionnaire (§3.8). Once one has
  // been started, keep showing it under that Career even if selection order
  // changes later.
  $: questionnaireCareer = $pc.questionnaire?.career ?? $pc.careers[0];

  // §3.3/§3.8 Career Pick budget - once spent, new "free" picks are locked
  // out until Character Creation is finalized (Advancement afterward spends
  // XP instead of Career Picks, so this cap only matters pre-finalization).
  $: picksRemaining = careerPicksTotal($pc) - careerPicksSpent($pc);
  $: freePicksLocked = !$pc.characterCreationFinalized && picksRemaining <= 0;

  $: eligibleTrees = SKILL_TREE_NAMES.filter((t) =>
    TREE_CAREER_ACCESS[t].some((c) => $pc.careers.includes(c as CareerName)),
  );

  type TalentGroup = { category: string; names: string[] };
  $: eligibleTalents = (() => {
    const map = new Map<string, Set<string>>();
    for (const c of $pc.careers) {
      for (const { category, talents } of CAREERS[c].talentAccess) {
        if (!map.has(category)) map.set(category, new Set());
        talents.forEach((t) => map.get(category)!.add(t));
      }
    }
    return [...map.entries()].map(([category, names]) => ({ category, names: [...names] }) as TalentGroup);
  })();

  function setPendingFree(key: string, e: Event) {
    pendingFree[key] = (e.currentTarget as HTMLInputElement).checked;
  }

  function nodeKey(tree: SkillTreeName, node: SkillNodeId) {
    return `${tree}:${node}`;
  }
  function ownedNode(tree: SkillTreeName, node: SkillNodeId) {
    return $pc.skillTreeNodes.find((n) => n.tree === tree && n.node === node);
  }
  function ownedNodesForTree(tree: SkillTreeName): SkillNodeId[] {
    return $pc.skillTreeNodes.filter((n) => n.tree === tree).map((n) => n.node);
  }
  function toggleNode(tree: SkillTreeName, node: SkillNodeId) {
    const existing = ownedNode(tree, node);
    if (existing) {
      $pc.skillTreeNodes = $pc.skillTreeNodes.filter((n) => !(n.tree === tree && n.node === node));
      if (!existing.free) $pc.xpAvailable += NODE_XP_COST[node];
    } else {
      const free = !!pendingFree[pendingFreeKey(nodeKey(tree, node))];
      $pc.skillTreeNodes = [...$pc.skillTreeNodes, { tree, node, free }];
      if (!free) $pc.xpAvailable -= NODE_XP_COST[node];
    }
  }

  function talentKey(category: string, name: string) {
    return `${category}:${name}`;
  }
  function ownedTalent(category: string, name: string) {
    return $pc.talentsOwned.find((t) => t.category === category && t.name === name);
  }
  function toggleTalent(category: string, name: string) {
    const existing = ownedTalent(category, name);
    if (existing) {
      $pc.talentsOwned = $pc.talentsOwned.filter((t) => !(t.category === category && t.name === name));
      if (!existing.free) $pc.xpAvailable += 500;
    } else {
      const free = !!pendingFree[pendingFreeKey(talentKey(category, name))];
      $pc.talentsOwned = [...$pc.talentsOwned, { category, name, free }];
      if (!free) $pc.xpAvailable -= 500;
    }
  }
</script>

<div class="w-full flex flex-col gap-3 text-sm">
  {#if !$pc.careers.length}
    <div class="text-gray-500">
      Check a Career first - the CAREERS box on the main sheet, or the Careers step above if you're in the
      Character Creator - that's what determines which Skill Trees and Talents show up here.
    </div>
  {/if}

  {#each $pc.careers as c (c)}
    {@const swLocked = c !== questionnaireCareer || hasSignatureWeapon(c) || $pc.characterCreationFinalized}
    <div class="border rounded-md p-2">
      <div class="flex justify-between items-start gap-2">
        <div class="font-bold">{c}</div>
        <button
          class="text-xs px-2 rounded-md whitespace-nowrap"
          class:bg-black={!swLocked}
          class:text-white={!swLocked}
          class:bg-gray-300={swLocked}
          class:text-gray-500={swLocked}
          disabled={swLocked}
          title={c !== questionnaireCareer
            ? "Only your first Career grants a Signature Weapon (§4.1)"
            : hasSignatureWeapon(c)
              ? "Already added"
              : "Add this Career's Signature Weapon to Gear (equipped, Standard/Healthy) and Attacks & Techniques"}
          on:click={() => addSignatureWeapon(c)}
        >
          + Add Signature Weapon
        </button>
      </div>
      {#if CAREERS[c].commonKnowledge}
        <div class="text-xs"><span class="font-semibold">Common Knowledge:</span> {CAREERS[c].commonKnowledge}</div>
      {/if}
      <div class="text-xs">
        <span class="font-semibold">Signature Weapon:</span>
        {CAREERS[c].signatureWeapon.name} - {CAREERS[c].signatureWeapon.profileLabel}, {CAREERS[c].signatureWeapon
          .damageType}{CAREERS[c].signatureWeapon.properties !== "-" ? `, ${CAREERS[c].signatureWeapon.properties}` : ""}.
        {CAREERS[c].signatureWeapon.special}
      </div>
      <div class="text-xs flex items-center gap-2">
        <span class="font-semibold">Trinket:</span>
        {#if ownedTrinket(c)}
          {ownedTrinket(c).text}
        {:else}
          <button
            class="px-2 rounded-md bg-black text-white whitespace-nowrap"
            title="Each Career you take grants one Trinket - a petty item with no mechanical effect (§4.2)"
            on:click={() => rollTrinket(c)}
          >
            Roll Trinket (d4)
          </button>
        {/if}
      </div>
      {#if c === questionnaireCareer}
        <CareerQuestionnaire career={c} />
      {/if}
    </div>
  {/each}

  <div class="text-xs bg-gray-100 rounded-md p-2">
    Check <strong>"free"</strong> before checking an item you're taking as a Career Pick during character
    creation (or any other source that grants it without spending XP) - that item won't touch XP Available.
    Leave "free" unchecked for a normal post-creation purchase and its cost is spent from XP Available when you
    check it.
    {#if $pc.age}
      Career Picks: {careerPicksSpent($pc)}/{careerPicksTotal($pc)} spent.
      {#if freePicksLocked}
        All spent - "free" is locked until Character Creation is finalized (Character Creator's Summary step);
        you can still check items normally, spending XP.
      {/if}
    {/if}
  </div>

  {#if eligibleTrees.length}
    <h2 class="text-base">Skill Trees</h2>
    {#each eligibleTrees as tree (tree)}
      <div class="border rounded-md p-2">
        <div class="font-bold">{tree}</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
          {#each NODE_ORDER as node (node)}
            {@const name = SKILL_TREE_NODE_NAMES[tree][node]}
            {@const desc = SKILL_TREE_NODE_DESC[tree][node]}
            {@const owned = ownedNode(tree, node)}
            {@const key = pendingFreeKey(nodeKey(tree, node))}
            {@const prereqMet = owned || nodePrerequisiteMet(ownedNodesForTree(tree), node)}
            <div class="flex items-start gap-1">
              <input
                type="checkbox"
                class="w-auto mt-0.5"
                checked={!!owned}
                on:change={() => toggleNode(tree, node)}
              />
              <label
                class="flex items-center gap-1 text-[10px] text-gray-500"
                title={!owned && freePicksLocked
                  ? "Career Picks are all spent - locked until Character Creation is finalized"
                  : "Free via Career Pick / character creation"}
              >
                <input
                  type="checkbox"
                  class="w-auto"
                  disabled={!!owned || freePicksLocked}
                  checked={owned ? owned.free : !!pendingFree[key]}
                  on:change={(e) => setPendingFree(key, e)}
                />
                free
              </label>
              <span
                class="text-xs leading-tight cursor-help"
                title={desc || "Full text not captured yet - see the book."}
              >
                <span class="font-mono">{node}</span> - {name || "(unnamed - check the book)"}
                <span class="text-gray-400">
                  ({NODE_XP_COST[node]} XP{node === "R1" ? ", or free via a Career Pick" : ""})
                </span>
                {#if desc}
                  <i class="material-icons text-[10px] align-middle text-gray-400">info</i>
                {/if}
                {#if !prereqMet}
                  <i
                    class="material-icons text-[10px] align-middle text-orange-600"
                    title="Prerequisite not met (§7.7): a higher Rank gate needs all lower Rank gates plus a Branch from each; a Branch needs its own Rank; a Mastery needs R4. Warning only - not blocked."
                  >
                    warning
                  </i>
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}

  <h2 class="text-base">Talents (500 XP each unless a Talent's own entry says otherwise)</h2>
  {#if !eligibleTalents.length}
    <div class="text-gray-500 text-xs">Check a Career above to see its Talent Access.</div>
  {/if}
  {#each eligibleTalents as group (group.category)}
    <div class="border rounded-md p-2">
      <div class="font-bold">{group.category}</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-1 mt-1">
        {#each group.names as name (name)}
          {@const owned = ownedTalent(group.category, name)}
          {@const key = pendingFreeKey(talentKey(group.category, name))}
          <div class="flex items-center gap-1 text-xs">
            <input type="checkbox" class="w-auto" checked={!!owned} on:change={() => toggleTalent(group.category, name)} />
            <label
              class="flex items-center gap-1 text-[10px] text-gray-500"
              title={!owned && freePicksLocked
                ? "Career Picks are all spent - locked until Character Creation is finalized"
                : "Free via Career Pick / character creation"}
            >
              <input
                type="checkbox"
                class="w-auto"
                disabled={!!owned || freePicksLocked}
                checked={owned ? owned.free : !!pendingFree[key]}
                on:change={(e) => setPendingFree(key, e)}
              />
              free
            </label>
            <span title={TALENT_DESC[name] || "Talent effect text not captured yet - see the book."} class="cursor-help">{name}</span>
          </div>
        {/each}
      </div>
    </div>
  {/each}

  <div class="text-xs text-gray-500">
    After character creation, any Talent can be learned for 500 XP and any Skill Tree can be learned with
    GM-approved fictional access, regardless of Career (§5.2, §7.8) - this list only reflects your current
    Careers, not a hard limit.
  </div>
</div>
