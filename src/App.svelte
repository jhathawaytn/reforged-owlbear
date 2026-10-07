<script lang="ts">
  import { PlayerCharacterStore as pc, careerPicksTotal, careerPicksSpent, ageXPDelta, levelUpAvailable } from "./lib/model/ReforgedCharacter";
  import { AGES, ANCESTRIES, ANCESTRY_BENEFIT, ageTooltip, titleForLevel } from "./lib/types";
  import LevelUpButton from "./lib/components/LevelUpButton.svelte";
  import type { Age } from "./lib/types";
  import ResumeCharacterCreatorButton from "./lib/components/chargen/ResumeCharacterCreatorButton.svelte";
  import { CAREER_NAMES } from "./lib/careers";
  import type { CareerName } from "./lib/careers";
  import StatView from "./lib/components/StatView.svelte";
  import GearView from "./lib/components/GearView.svelte";
  import UsageDiceView from "./lib/components/UsageDiceView.svelte";
  import ConditionsView from "./lib/components/ConditionsView.svelte";
  import AttacksView from "./lib/components/AttacksView.svelte";
  import CurrencyView from "./lib/components/CurrencyView.svelte";
  import { importFromJson } from "./lib/services/JSONImporter";
  import HpView from "./lib/components/HPView.svelte";
  import InfoButton from "./lib/components/InfoButton.svelte";
  import OptionsButton from "./lib/components/OptionsButton.svelte";
  import EquipmentButton from "./lib/components/EquipmentButton.svelte";
  import ExpeditionButton from "./lib/components/ExpeditionButton.svelte";
  import ExpeditionView from "./lib/components/ExpeditionView.svelte";
  import { Page } from "./lib/model/PageStore";
  import ArmorView from "./lib/components/ArmorView.svelte";
  import StrainView from "./lib/components/StrainView.svelte";
  import TechniqueView from "./lib/components/TechniqueView.svelte";
  import NotesButton from "./lib/components/NotesButton.svelte";
  import SkillsTalentsButton from "./lib/components/SkillsTalentsButton.svelte";
  import SkillsTalentsSummary from "./lib/components/SkillsTalentsSummary.svelte";
  import BackgroundSummary from "./lib/components/BackgroundSummary.svelte";
  import CharacterCreator from "./lib/components/chargen/CharacterCreator.svelte";
  import { ShowCharacterCreator } from "./lib/model/CharacterCreatorStore";
  import PlayersView from "./lib/components/PlayersView.svelte";
  import LifeBanner from "./lib/components/LifeBanner.svelte";
  import { onMount } from "svelte";
  import * as OBRHelper from "./lib/services/OBRHelper";
  import * as LocalStorageSaver from "./lib/services/LocalStorageSaver";
  import OBR from "@owlbear-rodeo/sdk";
  import { isSaveInProgress } from "./lib/services/LocalStorageSaver";
  import NotificationsButton from "./lib/components/NotificationsButton.svelte";
  import { initSettings } from "./lib/services/SettingsTracker";

  const { isGM } = OBRHelper;

  onMount(() => {
    initSettings();
    if (OBR.isAvailable) {
      OBRHelper.init();
    } else {
      LocalStorageSaver.init();
    }
  });

  const { canUndo, canRedo } = pc;

  let files: FileList;
  $: if (files) {
    for (const file of files) {
      file.text().then((txt) => {
        $pc = importFromJson(txt);
      });
      files = undefined;
      break;
    }
  }

  function toggleCareer(c: CareerName) {
    $pc.careers = $pc.careers.includes(c) ? $pc.careers.filter((x) => x !== c) : [...$pc.careers, c];
  }

  // Age's Starting XP (§3.3) is recorded as XP Earned - keep it in sync
  // however Age gets changed, not just from the Character Creator.
  function setAge(newAge: Age) {
    $pc = { ...$pc, age: newAge, ...ageXPDelta($pc, newAge) };
  }
  function onAgeChange(e: Event) {
    setAge((e.currentTarget as HTMLSelectElement).value as Age);
  }

  $: picksTotal = careerPicksTotal($pc);
  $: picksSpent = careerPicksSpent($pc);

  // Level (§7.3) only advances through the Level Up helper - meeting an XP
  // Earned threshold alone doesn't grant it "in the field" (§7.4).
  $: levelAvailable = levelUpAvailable($pc);
</script>

<!-- Mounted at the top level (not nested inside any other dialog) so its own
     <dialog> never collapses when another modal, e.g. Options, closes. -->
<CharacterCreator bind:showModal={$ShowCharacterCreator} />

<div class="flex items-center justify-center bg-black">
  <main>
    <div id="sheet" class="bg-black min-w-[277px] max-w-[1100px] p-1 flex flex-wrap gap-1" class:dead-sheet={$pc.dead}>
      <!-- HEADER: title + buttons, shown on every page -->
      <div class="w-full cell">
        <div class="flex gap-1 justify-around">
          <div class="flex flex-col items-center">
            <div class="flex items-center gap-1">
              <h1 class="leading-none">Reforged</h1>
              <InfoButton />
            </div>
            {#if $isSaveInProgress}
              <div
                title="save in progress..."
                class="absolute top-0 left-0 opacity-20 bg-black text-white p-1 rounded-md flex items-center"
              >
                <i class="material-icons">save</i>...
              </div>
            {/if}
            <div class="-translate-y-2 flex gap-1">
              {#if !$isGM}
                <button
                  on:click={() => pc.undo()}
                  class:opacity-50={!$canUndo}
                  disabled={!$canUndo}
                  title="Undo last change"
                  class="bg-black text-white rounded-md"
                >
                  <i class="material-icons translate-y-1 px-1">undo</i>
                </button>
                <button
                  on:click={() => pc.redo()}
                  class:opacity-50={!$canRedo}
                  disabled={!$canRedo}
                  title="Redo"
                  class="bg-black text-white rounded-md"
                >
                  <i class="material-icons translate-y-1 px-1">redo</i>
                </button>
              {/if}
              <OptionsButton bind:files />
              <ResumeCharacterCreatorButton />
              {#if $Page !== "sheet"}
                <button
                  class="bg-black text-white rounded-md px-1"
                  title="Back to character sheet"
                  on:click={() => ($Page = "sheet")}
                >
                  <i class="material-icons translate-y-1">arrow_back</i>
                </button>
              {/if}
              <EquipmentButton />
              <ExpeditionButton />
              <NotesButton />
              {#if OBR.isAvailable}
                <NotificationsButton />
              {/if}
              <PlayersView />
            </div>
          </div>
        </div>
      </div>
    <!-- Mortally Wounded / Clinging / Dead: on every page (V-011). -->
    <LifeBanner />
    {#if $Page === "sheet"}
      <!-- COLUMN 1: attributes, resources, conditions -->
      <div class="flex-[2] min-w-[257px] h-[700px] grid grid-rows-14 grid-cols-2 gap-2">
        <div class="row-span-2 cell"><StatView forStat="STR" /></div>
        <div class="row-span-2 cell"><StatView forStat="DEX" /></div>
        <div class="row-span-2 cell"><StatView forStat="INT" /></div>
        <div class="row-span-2 cell"><StatView forStat="WIL" /></div>
        <div class="row-span-5 cell"><HpView /></div>
        <div class="row-span-5 cell"><ArmorView /></div>
        <div class="row-span-2 cell"><StrainView /></div>
        <div class="row-span-2 cell"><TechniqueView /></div>
        <div class="col-span-full row-span-3 cell">
          <ConditionsView />
        </div>
      </div>

      <!-- COLUMN 2: identity, careers & xp -->
      <div class="flex-[2] min-w-[257px] h-[700px] grid grid-rows-8 grid-cols-2 gap-2">
        <div class="col-span-full cell">
          <label>
            <h2>NAME</h2>
            <input type="text" bind:value={$pc.name} />
          </label>
        </div>
        <div class="col-span-full cell">
          <label>
            <h2>PLAYER</h2>
            <input type="text" bind:value={$pc.playerName} />
          </label>
        </div>
        <div class="cell">
          <label>
            <h2>ANCESTRY</h2>
            <select bind:value={$pc.ancestry} title={$pc.ancestry ? ANCESTRY_BENEFIT[$pc.ancestry] : ""}>
              {#each ANCESTRIES as a}
                <option value={a}>{a || "-"}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="cell">
          <label>
            <h2>HERITAGE</h2>
            <input type="text" bind:value={$pc.heritage} />
          </label>
        </div>
        <div class="cell">
          <label>
            <h2>LANGUAGES</h2>
            <input type="text" bind:value={$pc.languages} />
          </label>
        </div>
        <div class="cell">
          <label>
            <h2>AGE</h2>
            <select value={$pc.age} title={ageTooltip($pc.age)} on:change={onAgeChange}>
              {#each AGES as age}
                <option value={age} title={ageTooltip(age)}>{age || "-"}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="col-span-full cell">
          <label>
            <h2>DEFINING TRAIT</h2>
            <input type="text" bind:value={$pc.definingTrait} />
          </label>
        </div>
        <div class="col-span-full cell">
          <label class="flex flex-col flex-1">
            <h2>FORMATIVE EXPERIENCE</h2>
            <textarea bind:value={$pc.formativeExperience} class="flex-1 resize-none" />
          </label>
        </div>
        <div class="col-span-full cell">
          <h2>CAREERS</h2>
          <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center text-xs">
            {#each CAREER_NAMES as c}
              <input type="checkbox" class="w-auto" checked={$pc.careers.includes(c)} on:change={() => toggleCareer(c)} />
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <span class="whitespace-nowrap cursor-pointer" on:click={() => toggleCareer(c)}>{c}</span>
            {/each}
          </div>
        </div>
        <div class="cell">
          <h2
            title="Level is determined by XP Earned (§7.3) - meeting a threshold doesn't grant it 'in the field': you still return to a settlement, resolve HP/Attribute Growth (§7.5), and gain at most 1 Level per session (not enforced here)."
          >
            LEVEL
          </h2>
          <div class="text-2xl font-bold text-center leading-none" class:text-red-700={levelAvailable}>{$pc.level}</div>
          <div class="text-[10px] text-gray-500 text-center">{titleForLevel($pc.level)}</div>
          <div class="flex justify-center mt-1">
            <LevelUpButton />
          </div>
        </div>
        <div class="cell">
          <h2 title="Available is what Skill Tree/Talent purchases spend from - Earned never decreases (§7.6).">
            XP
          </h2>
          <div class="grid grid-cols-2 gap-1">
            <input
              type="number"
              inputmode="numeric"
              min="0"
              bind:value={$pc.xpAvailable}
              title="XP Available - spent by Skill Tree/Talent purchases"
            />
            <input
              type="number"
              inputmode="numeric"
              min="0"
              bind:value={$pc.xpEarned}
              title="XP Earned - never decreases"
            />
            <div class="text-[10px] text-gray-500 text-center">avail</div>
            <div class="text-[10px] text-gray-500 text-center">earned</div>
          </div>
        </div>
      </div>

      <!-- COLUMN 3: skills & talents, background, attacks & techniques -->
      <div class="flex-[3] min-w-[257px] min-[805px]:h-[700px] grid grid-rows-[5fr_3fr_4fr] gap-2">
        <div class="cell">
          <div class="flex justify-between items-center gap-2">
            <h2>SKILLS &amp; TALENTS</h2>
            <div class="flex items-center gap-2">
              {#if $pc.age}
                <span
                  class="text-[10px] text-gray-500 whitespace-nowrap"
                  title="Career Picks granted by Age (§3.3) - each spent as a 'free' Skill Tree Rank or Talent in Manage"
                >
                  Picks: {picksSpent}/{picksTotal}
                </span>
              {/if}
              <SkillsTalentsButton />
            </div>
          </div>
          <SkillsTalentsSummary />
        </div>
        <div class="cell">
          <BackgroundSummary />
        </div>
        <div class="cell">
          <AttacksView />
        </div>
      </div>
    {:else if $Page === "equipment"}
      <!-- EQUIPMENT PAGE: gear, usage dice, coin -->
      <div class="w-full h-[700px] flex flex-col gap-2">
        <div class="cell flex-1 min-h-0">
          <GearView />
        </div>
        <div class="h-[130px] shrink-0 flex gap-2">
          <div class="cell flex-[3] min-h-0">
            <UsageDiceView />
          </div>
          <div class="cell flex-[1] min-h-0 min-w-[140px]">
            <CurrencyView />
          </div>
        </div>
      </div>
    {:else}
      <!-- SHARED COMPANY EXPEDITION PAGE: room-level state, visible to everyone -->
      <div class="w-full h-[700px]">
        <ExpeditionView />
      </div>
    {/if}
    </div>
  </main>
</div>

<style lang="postcss">
  input,
  select {
    @apply w-full;
  }

  .cell {
    --tw-bg-opacity: 1;
    background-color: rgb(255 255 255 / var(--tw-bg-opacity));
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    position: relative;
    border-radius: 0.5rem;
    box-shadow: inset 0 0 5px #000;
    min-width: 0;
  }
</style>
