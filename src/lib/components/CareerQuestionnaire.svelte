<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { CAREER_QUESTIONNAIRES } from "../careerQuestionnaires";
  import type { CareerName } from "../careers";
  import { rollSingleDie } from "../services/DicePlus";

  export let career: CareerName;

  const BEAT_KEYS = ["beat1", "beat2", "beat3", "beat4"] as const;
  type BeatKey = (typeof BEAT_KEYS)[number];

  $: data = CAREER_QUESTIONNAIRES[career];
  $: state = $pc.questionnaire?.career === career ? $pc.questionnaire : undefined;
  $: complete = !!(state?.beat1 && state?.beat2 && state?.beat3 && state?.beat4);

  let expanded = false;
  let initialized = false;
  $: if (!initialized) {
    expanded = !complete;
    initialized = true;
  }

  function ensureState() {
    if (!$pc.questionnaire || $pc.questionnaire.career !== career) {
      $pc.questionnaire = { career, rerollUsed: false };
    }
  }

  function updateBeat(beat: BeatKey, patch: Partial<import("../types").QuestionnaireAnswer>) {
    ensureState();
    const q = $pc.questionnaire!;
    const existing = q[beat] ?? { roll: 0, detail: "", applied: false };
    $pc.questionnaire = { ...q, [beat]: { ...existing, ...patch } };
  }

  function setRoll(beat: BeatKey, roll: number) {
    updateBeat(beat, { roll, applied: false });
  }
  async function rollBeat(beat: BeatKey) {
    setRoll(beat, await rollSingleDie(6));
  }
  function setDetail(beat: BeatKey, detail: string) {
    updateBeat(beat, { detail });
  }
  async function reroll(beat: BeatKey) {
    if (!$pc.questionnaire || $pc.questionnaire.rerollUsed) return;
    await rollBeat(beat);
    $pc.questionnaire = { ...$pc.questionnaire, rerollUsed: true };
  }

  // §3.2/§3.8 Attribute Maximum: each Beat 1-3 option lists exactly one
  // Attribute, so if it's already at 18 there is no other eligible Attribute
  // to redirect to - the increase is simply lost.
  function applyAttribute(beat: BeatKey) {
    const answer = $pc.questionnaire?.[beat];
    if (!answer) return;
    const option = data[beat].options[answer.roll - 1];
    if (!option?.attr || answer.applied) return;
    if ($pc.attributes[option.attr] < 18) {
      $pc.attributes[option.attr] += 1;
      $pc.attributeMax[option.attr] += 1;
    }
    updateBeat(beat, { applied: true });
  }
</script>

<div class="border rounded-md p-2 mt-1">
  <button class="flex justify-between items-center w-full text-left" on:click={() => (expanded = !expanded)}>
    <span class="font-bold text-xs">
      Career Questionnaire ({career}){complete ? " - complete" : ""}
    </span>
    <i class="material-icons text-sm">{expanded ? "expand_less" : "expand_more"}</i>
  </button>

  {#if expanded}
    <div class="text-[10px] text-gray-500 mt-1">
      Only the first Career gets a Questionnaire (§3.8). Roll or pick each Beat's answer, then Apply its Attribute
      increase. One reroll total is allowed across the whole Questionnaire.
    </div>

    {#each BEAT_KEYS as beat, i (beat)}
      {@const beatData = data[beat]}
      {@const answer = state?.[beat]}
      {@const option = answer ? beatData.options[answer.roll - 1] : undefined}
      <div class="border-t mt-2 pt-2">
        <div class="text-xs">
          <span class="font-semibold">Beat {i + 1} - {beatData.title}.</span>
          <span class="italic text-gray-500">{beatData.prompt}</span>
        </div>
        <div class="flex flex-wrap gap-1 mt-1">
          {#each beatData.options as opt, idx (idx)}
            <button
              class="text-[10px] px-1.5 py-0.5 rounded-md border whitespace-nowrap"
              class:bg-black={answer?.roll === idx + 1}
              class:text-white={answer?.roll === idx + 1}
              disabled={answer?.applied}
              title={opt.text}
              on:click={() => setRoll(beat, idx + 1)}
            >
              {idx + 1}{opt.attr ? ` +1${opt.attr}` : ""}
            </button>
          {/each}
          <button
            class="text-[10px] px-1.5 py-0.5 rounded-md border whitespace-nowrap"
            disabled={answer?.applied}
            on:click={() => rollBeat(beat)}
          >
            Roll d6
          </button>
          <button
            class="text-[10px] px-1.5 py-0.5 rounded-md border whitespace-nowrap"
            disabled={!state || state.rerollUsed}
            title="One reroll total across the whole Questionnaire - must keep the new result. Doesn't undo an already-Applied Attribute; adjust that by hand if needed."
            on:click={() => reroll(beat)}
          >
            Reroll{state?.rerollUsed ? " (used)" : ""}
          </button>
        </div>

        {#if option}
          <div class="text-xs mt-1">{option.text}</div>

          {#if option.attr}
            <div class="flex items-center gap-1 mt-1">
              <span class="text-[10px] text-gray-500">Grants +1 {option.attr}</span>
              <button
                class="text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap"
                class:bg-black={!answer.applied}
                class:text-white={!answer.applied}
                class:bg-gray-300={answer.applied}
                disabled={answer.applied}
                title="No Attribute may exceed 18 during Character Creation (§3.2) - if it's already there, this increase is lost."
                on:click={() => applyAttribute(beat)}
              >
                {answer.applied ? "Applied" : `Apply +1 ${option.attr}`}
              </button>
            </div>
          {/if}

          {#if option.detailPrompt}
            <label class="text-[10px] text-gray-500 flex flex-col mt-1 max-w-md">
              {option.detailPrompt}
              <input
                type="text"
                class="text-xs"
                value={answer.detail}
                on:input={(e) => setDetail(beat, e.currentTarget.value)}
              />
            </label>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>
