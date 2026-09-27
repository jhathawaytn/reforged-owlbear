<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { HAMLET_CONNECTION_TEMPLATES, COMPANY_CONNECTION_TEMPLATES } from "../types";
  import { CAREER_QUESTIONNAIRES } from "../careerQuestionnaires";

  // Typed answers aren't guaranteed to start capitalized - fix up just the
  // start of the sentence so joined prose doesn't dip into a lowercase mid-word.
  function capitalizeFirst(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Reads back the Career Questionnaire's 4 Beats and Hamlet/Company
  // Connection as a narrative, in the order a background would actually be
  // told. Defining Trait, Formative Experience, and Ancestry/Heritage
  // already have their own boxes on the sheet, so they aren't repeated here.
  // Each section joins into one paragraph; a Beat's "names/describes
  // something" detail runs through that option's own detailTemplate so the
  // answer reads as a natural clause instead of a bare instruction plus a
  // dangling answer. Anything not filled in yet is skipped.
  $: beatsParagraph = (() => {
    const q = $pc.questionnaire;
    if (!q) return "";
    const data = CAREER_QUESTIONNAIRES[q.career];
    return (["beat1", "beat2", "beat3", "beat4"] as const)
      .map((key) => ({ beatData: data[key], answer: q[key] }))
      .filter((b) => !!b.answer)
      .map((b) => {
        const opt = b.beatData.options[b.answer!.roll - 1];
        if (!opt) return "";
        const detailSentence = b.answer!.detail && opt.detailTemplate ? ` ${capitalizeFirst(opt.detailTemplate(b.answer!.detail))}` : "";
        return `${opt.text}${detailSentence}`;
      })
      .filter(Boolean)
      .join(" ");
  })();

  $: hamletParagraph = HAMLET_CONNECTION_TEMPLATES.map((tpl, i) => ($pc.hamletConnection[i] ? capitalizeFirst(tpl($pc.hamletConnection[i])) : ""))
    .filter(Boolean)
    .join(" ");
  $: companyParagraph = COMPANY_CONNECTION_TEMPLATES.map((tpl, i) => ($pc.companyConnection[i] ? capitalizeFirst(tpl($pc.companyConnection[i])) : ""))
    .filter(Boolean)
    .join(" ");

  $: autoParagraphs = [beatsParagraph, hamletParagraph, companyParagraph].filter(Boolean);
  $: autoText = autoParagraphs.join("\n\n");

  // A manual edit always wins over the auto-generated text once saved, so
  // small wording fixes stick instead of being recomputed away. "Reset to
  // auto-generated" clears it back to the live computation.
  $: displayText = $pc.backgroundOverride || autoText;
  $: displayParagraphs = displayText.split("\n\n").filter(Boolean);

  let editing = false;
  let draft = "";
  function startEdit() {
    draft = displayText;
    editing = true;
  }
  function save() {
    // If the saved draft is identical to the live auto-generated text
    // (because Reset was clicked, or nothing was actually changed), stay on
    // the live computation instead of freezing a snapshot of it.
    $pc.backgroundOverride = draft === autoText ? "" : draft;
    editing = false;
  }
  function cancel() {
    editing = false;
  }
  function resetToAuto() {
    // Only stages the draft - Cancel still discards this like any other
    // edit. The actual reset only commits when Save is clicked.
    draft = autoText;
  }
</script>

<div class="flex justify-between items-center gap-2">
  <h2>BACKGROUND</h2>
  {#if !editing}
    <button class="text-gray-400 hover:text-black" title="Edit Background" on:click={startEdit}>
      <i class="material-icons text-sm">edit</i>
    </button>
  {/if}
</div>

{#if editing}
  <textarea bind:value={draft} class="flex-1 w-full resize-none text-xs mt-1" rows="6" />
  <div class="flex gap-1 mt-1 flex-wrap">
    <button class="text-xs px-2 py-0.5 rounded-md bg-black text-white" on:click={save}>Save</button>
    <button class="text-xs px-2 py-0.5 rounded-md border" on:click={cancel}>Cancel</button>
    {#if $pc.backgroundOverride}
      <button
        class="text-xs px-2 py-0.5 rounded-md border"
        title="Discard the manual edit and go back to the auto-generated text"
        on:click={resetToAuto}
      >
        Reset to auto-generated
      </button>
    {/if}
  </div>
{:else if !displayParagraphs.length}
  <div class="text-xs text-gray-400 flex-1 flex items-center justify-center text-center px-2">
    Nothing established yet - fill in the Career Questionnaire and Hamlet/Company Connection (or use the
    Character Creator under Options) and it'll read back here.
  </div>
{:else}
  <div class="flex-1 overflow-y-auto mt-1 text-xs flex flex-col gap-1">
    {#each displayParagraphs as p, i (i)}
      <p>{p}</p>
    {/each}
  </div>
{/if}
