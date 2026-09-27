<script lang="ts">
  import Modal from "../Modal.svelte";
  import SkillsTalentsPicker from "../SkillsTalentsPicker.svelte";
  import { PlayerCharacterStore as pc, careerPicksTotal, careerPicksSpent, ageXPDelta } from "../../model/ReforgedCharacter";
  import { applyStartingKit } from "../../compendium";
  import { rollDieSides } from "../../utils";
  import { rollD66Trait } from "../../definingTraits";
  import { CAREER_NAMES, CAREERS } from "../../careers";
  import type { CareerName } from "../../careers";
  import { CAREER_QUESTIONNAIRES } from "../../careerQuestionnaires";
  import {
    AGES,
    ageTooltip,
    applyAgeAttrDeltas,
    ANCESTRIES,
    ANCESTRY_BENEFIT,
    ATTRIBUTES,
    HAMLET_CONNECTION_PROMPTS,
    COMPANY_CONNECTION_PROMPTS,
  } from "../../types";
  import type { Attribute, Age } from "../../types";

  export let showModal = false;

  $: locked = $pc.characterCreationFinalized;

  function roll2d6plus3(): number {
    return rollDieSides(6) + rollDieSides(6) + 3;
  }

  // 1. Attributes - roll once, one optional swap. attributeMax is kept
  // identical to attributes throughout Character Creation (see types.ts) -
  // nothing has reduced or grown it yet, so there's no gap between them.
  function rollAttributes() {
    if ($pc.attributesRolled || locked) return;
    const next = { ...$pc.attributes };
    for (const attr of ATTRIBUTES) next[attr] = roll2d6plus3();
    $pc.attributes = next;
    $pc.attributeMax = { ...next };
    $pc.attributesRolled = true;
  }
  let swapA: Attribute = "STR";
  let swapB: Attribute = "DEX";
  function applySwap() {
    if ($pc.attributeSwapUsed || locked || swapA === swapB) return;
    $pc.attributes = { ...$pc.attributes, [swapA]: $pc.attributes[swapB], [swapB]: $pc.attributes[swapA] };
    $pc.attributeMax = { ...$pc.attributes };
    $pc.attributeSwapUsed = true;
  }

  // 2. Hit Protection - roll once
  function rollHP() {
    if ($pc.hpRolled || locked) return;
    const roll = rollDieSides(6);
    $pc.hitPoints = roll;
    $pc.maxHitPoints = roll;
    $pc.hpRolled = true;
  }

  // 3. Age - not locked (setAge is a safe delta, repeat changes don't corrupt
  // XP), but does keep xpEarned in sync with whichever Age is currently set.
  const AGE_BY_ROLL: Record<number, Age> = { 1: "Young Adult", 2: "Mature", 3: "Prime", 4: "Prime", 5: "Old", 6: "Very Old" };
  function setAge(newAge: Age) {
    $pc = { ...$pc, age: newAge, ...ageXPDelta($pc, newAge) };
  }
  function rollAge() {
    setAge(AGE_BY_ROLL[rollDieSides(6)]);
  }
  // Applying the Attribute Adjustment is a separate, one-time action (unlike
  // the XP delta above, a floor/ceiling-clamped Attribute change can't be
  // safely reversed if Age is changed again afterward).
  function applyAgeAdjustment() {
    if ($pc.ageAdjustmentApplied || locked || !$pc.age) return;
    $pc.attributes = applyAgeAttrDeltas($pc.attributes, $pc.age);
    $pc.attributeMax = applyAgeAttrDeltas($pc.attributeMax, $pc.age);
    $pc.ageAdjustmentApplied = true;
  }
  function onAgeChange(e: Event) {
    setAge((e.currentTarget as HTMLSelectElement).value as Age);
  }

  // 4. Defining Trait - roll once, one reroll only if rolled
  function rollTrait() {
    if ($pc.definingTraitRolled || locked) return;
    const t = rollD66Trait(rollDieSides);
    $pc.definingTrait = `${t.name} - ${t.text}`;
    $pc.definingTraitRolled = true;
  }
  function rerollTrait() {
    if (!$pc.definingTraitRolled || $pc.definingTraitRerollUsed || locked) return;
    const t = rollD66Trait(rollDieSides);
    $pc.definingTrait = `${t.name} - ${t.text}`;
    $pc.definingTraitRerollUsed = true;
  }

  // 5. Formative Experience - apply once
  let feUp1: Attribute = "STR";
  let feUp2: Attribute = "WIL";
  let feDown: Attribute = "INT";
  function useSample(name: string, text: string, up1: Attribute, up2: Attribute, down: Attribute) {
    $pc.formativeExperience = `${name}. ${text} +1${up1}, +1${up2}, -1${down}`;
    feUp1 = up1;
    feUp2 = up2;
    feDown = down;
  }
  // Attribute Maximum (§3.2): if a +1 would exceed 18, apply it to the other
  // Attribute this experience lists instead; if both are already 18, that
  // point is lost (never redirected to feDown - it isn't "listed" as a gain).
  function applyFormativeExperience() {
    if ($pc.formativeExperienceApplied || locked || feUp1 === feUp2) return;
    const next = { ...$pc.attributes };
    let up1Grew = false;
    let up2Grew = false;
    if (next[feUp1] < 18) {
      next[feUp1] += 1;
      up1Grew = true;
    }
    if (next[feUp2] < 18) {
      next[feUp2] += 1;
      up2Grew = true;
    }
    if (!up1Grew && next[feUp2] < 18) next[feUp2] += 1;
    if (!up2Grew && next[feUp1] < 18) next[feUp1] += 1;
    next[feDown] -= 1;
    $pc.attributes = next;
    $pc.attributeMax = { ...next };
    $pc.formativeExperienceApplied = true;
  }

  // 16. Finalize
  function finalize() {
    $pc.characterCreationFinalized = true;
  }

  // 7. Languages
  $: languageSlotHint = (() => {
    const int = $pc.attributes.INT;
    if (int < 15) return "Common + Heritage language only, until INT reaches 15 (§3.6).";
    const bonus = Math.min(4, int - 14);
    return `INT ${int} unlocks ${bonus} bonus language slot${bonus === 1 ? "" : "s"} beyond Common + Heritage - still must be learned through study/immersion.`;
  })();

  // 9-11. Careers
  function toggleCareer(c: CareerName) {
    $pc.careers = $pc.careers.includes(c) ? $pc.careers.filter((x) => x !== c) : [...$pc.careers, c];
  }

  // 12. Identity
  $: breakingPointHook = (() => {
    const q = $pc.questionnaire;
    const b4 = q?.beat4;
    if (!q || !b4) return "";
    const opt = CAREER_QUESTIONNAIRES[q.career].beat4.options[b4.roll - 1];
    return opt ? `${opt.text}${b4.detail ? ` (${b4.detail})` : ""}` : "";
  })();
  // Breaking Point's hook is worth tracking alongside every other ongoing
  // hook (rivals, debts, oaths...), so offer to copy it into the same Hooks
  // field the Notes button reads/writes, instead of only living here.
  function addBreakingPointToHooks() {
    if (!breakingPointHook || $pc.hooks.includes(breakingPointHook)) return;
    $pc.hooks = $pc.hooks ? `${$pc.hooks}\n${breakingPointHook}` : breakingPointHook;
  }

  // 16. Summary - the book's real §3.13 checklist, matched item-for-item.
  // Same "first Career" concept SkillsTalentsPicker uses for the
  // Questionnaire/Signature Weapon lock.
  $: questionnaireCareer = $pc.questionnaire?.career ?? $pc.careers[0];
  $: signatureWeaponRecorded = !!questionnaireCareer && $pc.gear.some((g) => g.name === CAREERS[questionnaireCareer].signatureWeapon.name);
  $: summaryChecklist = [
    { label: "Generated Attributes, used or declined your optional swap", done: $pc.attributesRolled },
    { label: "Recorded starting Hit Protection", done: $pc.hpRolled },
    { label: "Rolled Age and recorded your Starting XP as XP Earned", done: !!$pc.age },
    { label: "Chosen a Defining Trait", done: !!$pc.definingTrait },
    { label: "Applied your Formative Experience", done: $pc.formativeExperienceApplied },
    { label: "Verified that no final Attribute exceeds 18", done: ATTRIBUTES.every((a) => $pc.attributes[a] <= 18) },
    { label: "Chosen an Ancestry and recorded its benefit", done: !!$pc.ancestry },
    { label: "Established your Heritage", done: !!$pc.heritage },
    {
      label: "Recorded your established Arcane feat (Arcane characters only)",
      done: !!$pc.arcaneFeat,
      na: $pc.ancestry !== "Arcane",
    },
    { label: "Recorded Common, your heritage language, and any additional language slots", done: !!$pc.languages },
    { label: "Chosen a Name", done: !!$pc.name },
    { label: "Selected your first Career", done: $pc.careers.length > 0 },
    { label: "Spent your first Career Pick on Rank 1 in an eligible Skill Tree or one eligible Talent", done: careerPicksSpent($pc) >= 1 },
    {
      label: "Completed your first Career's Questionnaire and applied its three Attribute increases",
      done: !!(
        $pc.questionnaire?.beat1?.applied &&
        $pc.questionnaire?.beat2?.applied &&
        $pc.questionnaire?.beat3?.applied &&
        $pc.questionnaire?.beat4
      ),
    },
    { label: "Recorded your Breaking Point hook", done: !!breakingPointHook },
    { label: "Resolved any additional Career Picks", done: !!$pc.age && careerPicksSpent($pc) >= careerPicksTotal($pc) },
    { label: "Recorded Common Knowledge, Tree Access, and Talent Access for each Career selected", done: $pc.careers.length > 0 },
    { label: "Recorded your Signature Weapon", done: signatureWeaponRecorded },
    {
      label: "Recorded a Trinket for each distinct Career selected",
      done: $pc.careers.length > 0 && $pc.careers.every((c) => $pc.trinkets.some((t) => t.career === c)),
    },
    { label: "Recorded your Identity notes", done: !!$pc.notes },
    { label: "Recorded your starting equipment and purchased any additional equipment", done: $pc.startingKitApplied },
    { label: "Established your Hamlet Connection", done: $pc.hamletConnection.some((a) => !!a) },
    { label: "Established your Company Connection", done: $pc.companyConnection.some((a) => !!a) },
  ];

  // A step rail so the wizard doesn't require scrolling all 16 steps to see
  // what's left. Ticks reuse simple, coarser checks than the Summary above -
  // one per numbered section (9-11 share a step, same as the headings).
  $: stepRail = [
    { n: "1", done: $pc.attributesRolled },
    { n: "2", done: $pc.hpRolled },
    { n: "3", done: !!$pc.age },
    { n: "4", done: !!$pc.definingTrait },
    { n: "5", done: $pc.formativeExperienceApplied },
    { n: "6", done: !!$pc.ancestry && !!$pc.heritage },
    { n: "7", done: !!$pc.languages },
    { n: "8", done: !!$pc.name },
    { n: "9-11", done: careerPicksSpent($pc) >= 1 },
    { n: "12", done: !!$pc.notes },
    { n: "13", done: $pc.startingKitApplied },
    { n: "14", done: $pc.hamletConnection.some((a) => !!a) },
    { n: "15", done: $pc.companyConnection.some((a) => !!a) },
    { n: "16", done: locked },
  ];

  let bodyEl: HTMLDivElement;
  function scrollToStep(n: string) {
    bodyEl?.querySelector(`#cc-step-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
</script>

<Modal bind:showModal vw={85}>
  <h1 slot="header">Character Creator</h1>
  <div class="w-full flex gap-2">
    <div class="flex flex-col gap-0.5 shrink-0 overflow-y-auto pr-1 border-r" style="max-height: 70vh;">
      {#each stepRail as step (step.n)}
        <button
          class="text-[10px] w-9 text-center rounded-md px-1 py-0.5 whitespace-nowrap"
          class:bg-green-700={step.done}
          class:text-white={step.done}
          class:border={!step.done}
          on:click={() => scrollToStep(step.n)}
        >
          {step.n}
        </button>
      {/each}
    </div>
    <div class="w-full min-w-0 max-h-[70vh] overflow-y-auto flex flex-col gap-2 text-sm pr-1" bind:this={bodyEl}>
    <div class="text-xs text-gray-500">
      Follows Ch.3 - Character Creation in order. Nothing here is enforced; roll or fill in whatever you like,
      whenever you like. Everything is bound to the same sheet you'll play from.
    </div>

    <div id="cc-step-1" class="border rounded-md p-2">
      <div class="font-bold text-sm">
        1. Attributes <span class="text-xs text-gray-500 italic font-normal">§3.2 - 2d6+3 x4, assign, one optional swap</span>
      </div>
      <div class="grid grid-cols-4 gap-2 mt-1">
        {#each ATTRIBUTES as attr}
          <label class="flex flex-col text-xs">
            {attr}
            <input type="number" inputmode="numeric" bind:value={$pc.attributes[attr]} class="w-full" />
          </label>
        {/each}
      </div>
      <button
        class="text-xs px-2 py-0.5 rounded-md mt-1"
        class:bg-black={!($pc.attributesRolled || locked)}
        class:text-white={!($pc.attributesRolled || locked)}
        class:bg-gray-300={$pc.attributesRolled || locked}
        class:text-gray-500={$pc.attributesRolled || locked}
        disabled={$pc.attributesRolled || locked}
        on:click={rollAttributes}
      >
        {$pc.attributesRolled ? "Rolled" : "Roll 2d6+3 x4"}
      </button>
      <div class="flex gap-1 mt-2 items-center text-xs flex-wrap">
        <span class="text-gray-500">Swap:</span>
        <select bind:value={swapA} disabled={$pc.attributeSwapUsed || locked}>
          {#each ATTRIBUTES as a}<option value={a}>{a}</option>{/each}
        </select>
        <span>&harr;</span>
        <select bind:value={swapB} disabled={$pc.attributeSwapUsed || locked}>
          {#each ATTRIBUTES as a}<option value={a}>{a}</option>{/each}
        </select>
        <button
          class="px-2 py-0.5 rounded-md border"
          disabled={$pc.attributeSwapUsed || locked || swapA === swapB}
          on:click={applySwap}
        >
          {$pc.attributeSwapUsed ? "Swap used" : "Apply swap (once)"}
        </button>
      </div>
      <div class="text-[10px] text-gray-500 mt-1">No Attribute may exceed 18 during Character Creation (§3.2).</div>
    </div>

    <div id="cc-step-2" class="border rounded-md p-2">
      <div class="font-bold text-sm">2. Hit Protection (HP) <span class="text-xs text-gray-500 italic font-normal">§3.2 - roll 1d6</span></div>
      <div class="flex items-center gap-2 mt-1">
        <input type="number" inputmode="numeric" bind:value={$pc.hitPoints} class="w-20" />
        <button
          class="text-xs px-2 py-0.5 rounded-md"
          class:bg-black={!($pc.hpRolled || locked)}
          class:text-white={!($pc.hpRolled || locked)}
          class:bg-gray-300={$pc.hpRolled || locked}
          class:text-gray-500={$pc.hpRolled || locked}
          disabled={$pc.hpRolled || locked}
          on:click={rollHP}
        >
          {$pc.hpRolled ? "Rolled" : "Roll 1d6"}
        </button>
      </div>
    </div>

    <div id="cc-step-3" class="border rounded-md p-2">
      <div class="font-bold text-sm">3. Age <span class="text-xs text-gray-500 italic font-normal">§3.3 - roll 1d6, not chosen</span></div>
      <div class="flex items-center gap-1 mt-1 flex-wrap">
        <select value={$pc.age} title={ageTooltip($pc.age)} on:change={onAgeChange}>
          {#each AGES as age}
            <option value={age} title={ageTooltip(age)}>{age || "-"}</option>
          {/each}
        </select>
        <button class="text-xs px-2 py-0.5 rounded-md bg-black text-white" on:click={rollAge}>Roll 1d6</button>
        <button
          class="text-xs px-2 py-0.5 rounded-md"
          class:bg-black={!($pc.ageAdjustmentApplied || locked)}
          class:text-white={!($pc.ageAdjustmentApplied || locked)}
          class:bg-gray-300={$pc.ageAdjustmentApplied || locked}
          class:text-gray-500={$pc.ageAdjustmentApplied || locked}
          disabled={$pc.ageAdjustmentApplied || locked || !$pc.age}
          title="Attribute Maximum (18) and Attribute Floor (6) are respected. Doesn't re-apply if you change Age afterward - adjust by hand if needed."
          on:click={applyAgeAdjustment}
        >
          {$pc.ageAdjustmentApplied ? "Adjustment applied" : "Apply Attribute Adjustment"}
        </button>
      </div>
      {#if $pc.age}
        <div class="text-xs text-gray-500 mt-1">
          {ageTooltip($pc.age)} - {$pc.startingXPApplied} Starting XP recorded in XP Earned.
        </div>
      {/if}
    </div>

    <div id="cc-step-4" class="border rounded-md p-2">
      <div class="font-bold text-sm">
        4. Defining Trait <span class="text-xs text-gray-500 italic font-normal">§3.4 - roll d66 or choose; one reroll only if rolled</span>
      </div>
      <input type="text" bind:value={$pc.definingTrait} class="mt-1 w-full" placeholder="e.g. Watchful - You clock the exits..." />
      <div class="flex gap-1 mt-1">
        <button
          class="text-xs px-2 py-0.5 rounded-md"
          class:bg-black={!($pc.definingTraitRolled || locked)}
          class:text-white={!($pc.definingTraitRolled || locked)}
          class:bg-gray-300={$pc.definingTraitRolled || locked}
          class:text-gray-500={$pc.definingTraitRolled || locked}
          disabled={$pc.definingTraitRolled || locked}
          on:click={rollTrait}
        >
          {$pc.definingTraitRolled ? "Rolled" : "Roll d66"}
        </button>
        <button
          class="text-xs px-2 py-0.5 rounded-md border"
          disabled={!$pc.definingTraitRolled || $pc.definingTraitRerollUsed || locked}
          on:click={rerollTrait}
        >
          {$pc.definingTraitRerollUsed ? "Reroll used" : "Reroll (1x)"}
        </button>
      </div>
    </div>

    <div id="cc-step-5" class="border rounded-md p-2">
      <div class="font-bold text-sm">
        5. Formative Experience
        <span class="text-xs text-gray-500 italic font-normal">§3.5 - +1 two Attributes, -1 one Attribute (may be one you just raised)</span>
      </div>
      <textarea
        bind:value={$pc.formativeExperience}
        class="mt-1 w-full resize-none"
        rows="2"
        placeholder="One experience marked you - for the better in two ways, for the worse in one. What was it?"
      />
      <div class="flex gap-1 mt-1 flex-wrap">
        <button
          class="text-xs px-2 py-0.5 rounded-md border"
          on:click={() =>
            useSample(
              "Survived a Brutal Winter",
              "You endured months of isolation, hunger, and relentless hardship. The experience made you tougher and more self-reliant, but left you distant from others.",
              "STR",
              "WIL",
              "INT",
            )}
        >
          Survived a Brutal Winter
        </button>
        <button
          class="text-xs px-2 py-0.5 rounded-md border"
          on:click={() =>
            useSample(
              "Studied Under a Demanding Priest",
              "Years of strict discipline sharpened your judgment and self-control but left little time for physical training.",
              "INT",
              "WIL",
              "STR",
            )}
        >
          Studied Under a Demanding Priest
        </button>
      </div>
      <div class="flex gap-1 mt-2 items-center text-xs flex-wrap">
        <span class="text-gray-500">Apply:</span>
        <span>+1</span>
        <select bind:value={feUp1}>{#each ATTRIBUTES as a}<option value={a}>{a}</option>{/each}</select>
        <span>+1</span>
        <select bind:value={feUp2}>{#each ATTRIBUTES as a}<option value={a}>{a}</option>{/each}</select>
        <span>-1</span>
        <select bind:value={feDown}>{#each ATTRIBUTES as a}<option value={a}>{a}</option>{/each}</select>
        <button
          class="px-2 py-0.5 rounded-md"
          class:bg-black={!($pc.formativeExperienceApplied || locked)}
          class:text-white={!($pc.formativeExperienceApplied || locked)}
          class:bg-gray-300={$pc.formativeExperienceApplied || locked}
          class:text-gray-500={$pc.formativeExperienceApplied || locked}
          disabled={$pc.formativeExperienceApplied || locked || feUp1 === feUp2}
          on:click={applyFormativeExperience}
        >
          {$pc.formativeExperienceApplied ? "Applied" : "Apply"}
        </button>
      </div>
    </div>

    <div id="cc-step-6" class="border rounded-md p-2">
      <div class="font-bold text-sm">6. Ancestry &amp; Heritage <span class="text-xs text-gray-500 italic font-normal">§3.6</span></div>
      <div class="flex gap-2 mt-1 flex-wrap">
        <label class="flex flex-col text-xs">
          Ancestry
          <select bind:value={$pc.ancestry} title={$pc.ancestry ? ANCESTRY_BENEFIT[$pc.ancestry] : ""}>
            {#each ANCESTRIES as a}<option value={a}>{a || "-"}</option>{/each}
          </select>
        </label>
        <label class="flex flex-col text-xs flex-1">
          Heritage
          <input type="text" bind:value={$pc.heritage} />
        </label>
      </div>
      {#if $pc.ancestry}
        <div class="text-xs text-gray-500 mt-1">{ANCESTRY_BENEFIT[$pc.ancestry]}</div>
      {/if}
      {#if $pc.ancestry === "Arcane"}
        <label class="flex flex-col text-xs mt-1">
          Established minor magical feat
          <input type="text" bind:value={$pc.arcaneFeat} placeholder="A glamour, a whisper to animals, a flicker of cold flame..." />
        </label>
      {/if}
    </div>

    <div id="cc-step-7" class="border rounded-md p-2">
      <div class="font-bold text-sm">7. Languages <span class="text-xs text-gray-500 italic font-normal">§3.6</span></div>
      <input type="text" bind:value={$pc.languages} class="mt-1 w-full" placeholder="Common, Halfling..." />
      <div class="text-xs text-gray-500 mt-1">{languageSlotHint}</div>
    </div>

    <div id="cc-step-8" class="border rounded-md p-2">
      <div class="font-bold text-sm">8. Name <span class="text-xs text-gray-500 italic font-normal">§3.7</span></div>
      <input type="text" bind:value={$pc.name} class="mt-1 w-full" />
    </div>

    <div id="cc-step-9-11" class="border rounded-md p-2">
      <div class="font-bold text-sm">
        9-11. Careers, Career Picks &amp; Questionnaire <span class="text-xs text-gray-500 italic font-normal">§3.8</span>
      </div>
      <div class="grid grid-cols-2 gap-1 mt-1 text-sm">
        {#each CAREER_NAMES as c}
          <label class="flex items-center gap-1">
            <input type="checkbox" class="w-auto" checked={$pc.careers.includes(c)} on:change={() => toggleCareer(c)} />
            {c}
          </label>
        {/each}
      </div>
      <div class="text-xs text-gray-500 mt-1">
        Age determines Career Picks ({careerPicksTotal($pc)} total, {careerPicksSpent($pc)} spent so far). Only
        your first Career gets a Questionnaire.
      </div>
      <div class="mt-2">
        <SkillsTalentsPicker />
      </div>
    </div>

    <div id="cc-step-12" class="border rounded-md p-2">
      <div class="font-bold text-sm">
        12. Identity <span class="text-xs text-gray-500 italic font-normal">§3.9 - a moment to consider what you've established</span>
      </div>
      <div class="text-xs mt-1 grid gap-0.5">
        <div><span class="font-semibold">Defining Trait:</span> {$pc.definingTrait || "-"}</div>
        <div><span class="font-semibold">Formative Experience:</span> {$pc.formativeExperience || "-"}</div>
        <div><span class="font-semibold">Ancestry / Heritage:</span> {$pc.ancestry || "-"} / {$pc.heritage || "-"}</div>
        <div><span class="font-semibold">Name:</span> {$pc.name || "-"}</div>
        {#if breakingPointHook}
          {@const hookCopied = $pc.hooks.includes(breakingPointHook)}
          <div class="flex items-center gap-2 flex-wrap">
            <span><span class="font-semibold">Breaking Point:</span> {breakingPointHook}</span>
            <button
              class="text-[10px] px-1.5 py-0.5 rounded-md border whitespace-nowrap"
              disabled={hookCopied}
              title="Copy this into Hooks (the Notes button, top of sheet) so it's tracked with your other ongoing hooks"
              on:click={addBreakingPointToHooks}
            >
              {hookCopied ? "Added to Hooks" : "Add to Hooks"}
            </button>
          </div>
        {/if}
      </div>
      <ul class="text-xs text-gray-500 mt-1 list-disc pl-4">
        <li>What does your character want?</li>
        <li>What do they fear?</li>
        <li>What do they regret?</li>
        <li>Who or what still matters to them?</li>
        <li>What part of their old life are they trying to recover, escape, or replace?</li>
      </ul>
      <textarea
        bind:value={$pc.notes}
        class="mt-1 w-full resize-none"
        rows="2"
        placeholder="You don't need complete answers - record what you do establish. Shares the Notes button's Notes field on the main sheet."
      />
    </div>

    <div id="cc-step-13" class="border rounded-md p-2">
      <div class="font-bold text-sm">13. Starting Equipment <span class="text-xs text-gray-500 italic font-normal">§3.10</span></div>
      <button
        class="text-xs px-2 py-0.5 rounded-md mt-1"
        class:bg-black={!($pc.startingKitApplied || locked)}
        class:text-white={!($pc.startingKitApplied || locked)}
        class:bg-gray-300={$pc.startingKitApplied || locked}
        class:text-gray-500={$pc.startingKitApplied || locked}
        disabled={$pc.startingKitApplied || locked}
        on:click={() => applyStartingKit(pc)}
      >
        {$pc.startingKitApplied ? "Added" : "Add Starting Kit + Roll Coin"}
      </button>
      <div class="text-xs text-gray-500 mt-1">
        Backpack, Trail Rations (d6), Waterskin (d6 Water), Torch Bundle (d6), Tinderbox, plus 3d6x10 Silver
        Pennies. Visit the Equipment page's Gear shop to buy anything more before play begins.
      </div>
    </div>

    <div id="cc-step-14" class="border rounded-md p-2">
      <div class="font-bold text-sm">14. Hamlet Connection <span class="text-xs text-gray-500 italic font-normal">§3.11</span></div>
      <div class="text-[10px] text-gray-500 mt-1">
        Each question below is optional individually, but answer at least one to complete Character Creation.
      </div>
      <div class="flex flex-col gap-1 mt-1">
        {#each HAMLET_CONNECTION_PROMPTS as prompt, i}
          <label class="text-xs">
            {prompt}
            <input type="text" bind:value={$pc.hamletConnection[i]} class="w-full" />
          </label>
        {/each}
      </div>
    </div>

    <div id="cc-step-15" class="border rounded-md p-2">
      <div class="font-bold text-sm">15. Company Connection <span class="text-xs text-gray-500 italic font-normal">§3.12</span></div>
      <div class="text-[10px] text-gray-500 mt-1">
        Each question below is optional individually, but answer at least one to complete Character Creation.
      </div>
      <div class="flex flex-col gap-1 mt-1">
        {#each COMPANY_CONNECTION_PROMPTS as prompt, i}
          <label class="text-xs">
            {prompt}
            <input type="text" bind:value={$pc.companyConnection[i]} class="w-full" />
          </label>
        {/each}
      </div>
    </div>

    <div id="cc-step-16" class="border rounded-md p-2">
      <div class="font-bold text-sm">16. Character Creation Summary <span class="text-xs text-gray-500 italic font-normal">§3.13</span></div>
      <ul class="text-xs mt-1 grid gap-0.5">
        {#each summaryChecklist as item}
          <li class:text-green-700={item.done && !item.na} class:text-gray-400={!item.done || item.na}>
            {item.na ? "➖" : item.done ? "☑" : "☐"} {item.label}{item.na ? " (N/A)" : ""}
          </li>
        {/each}
      </ul>
      <div class="flex gap-1 mt-2">
        <button
          class="text-xs px-2 py-1 rounded-md"
          class:bg-black={!locked}
          class:text-white={!locked}
          class:bg-gray-300={locked}
          class:text-gray-500={locked}
          disabled={locked}
          title="Locks the one-time creation rolls above (Attributes, HP, Age's Attribute Adjustment, Defining Trait, Formative Experience, Starting Kit, Signature Weapon) and lifts the Career Pick cap on 'free' picks so Advancement can still mark things free later if needed."
          on:click={finalize}
        >
          {locked ? "Finalized" : "Finalize Character Creation"}
        </button>
        <button class="text-xs px-2 py-1 rounded-md bg-black text-white" on:click={() => (showModal = false)}>
          Close
        </button>
      </div>
    </div>
    </div>
  </div>
</Modal>
