<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { SKILL_TREE_NODE_NAMES, SKILL_TREE_NODE_DESC, NODE_ORDER } from "../skillTrees";
  import type { SkillTreeName } from "../skillTrees";
  import { TALENT_DESC } from "../talents";
  import { CAREERS } from "../careers";

  // Combined Common Knowledge across all selected Careers, de-duplicated,
  // each tagged with which Career(s) grant it (shown on hover).
  $: commonKnowledge = (() => {
    const sources = new Map<string, string[]>();
    for (const c of $pc.careers) {
      for (const raw of CAREERS[c].commonKnowledge.split(",")) {
        const k = raw.trim();
        if (!k) continue;
        if (!sources.has(k)) sources.set(k, []);
        sources.get(k)!.push(c);
      }
    }
    return [...sources.entries()].map(([name, from]) => ({ name, from }));
  })();
  $: missingCK = $pc.careers.filter((c) => !CAREERS[c].commonKnowledge);

  type NodeEntry = { label: string; desc: string };
  type TreeGroup = { tree: SkillTreeName; nodes: NodeEntry[] };
  $: treeGroups = (() => {
    const byTree = new Map<SkillTreeName, NodeEntry[]>();
    for (const n of $pc.skillTreeNodes) {
      const name = SKILL_TREE_NODE_NAMES[n.tree][n.node];
      const desc = SKILL_TREE_NODE_DESC[n.tree][n.node];
      const label = `${n.node}${name ? ` ${name}` : ""}${n.free ? " (free)" : ""}`;
      if (!byTree.has(n.tree)) byTree.set(n.tree, []);
      byTree.get(n.tree)!.push({ label, desc });
    }
    for (const [, entries] of byTree) {
      entries.sort((a, b) => NODE_ORDER.indexOf(a.label.split(" ")[0] as never) - NODE_ORDER.indexOf(b.label.split(" ")[0] as never));
    }
    return [...byTree.entries()].map(([tree, nodes]) => ({ tree, nodes }) as TreeGroup);
  })();

  type TalentEntry = { label: string; desc: string };
  type TalentGroupDisplay = { category: string; names: TalentEntry[] };
  $: talentGroups = (() => {
    const byCat = new Map<string, TalentEntry[]>();
    for (const t of $pc.talentsOwned) {
      if (!byCat.has(t.category)) byCat.set(t.category, []);
      byCat.get(t.category)!.push({ label: t.free ? `${t.name} (free)` : t.name, desc: TALENT_DESC[t.name] || "" });
    }
    return [...byCat.entries()].map(([category, names]) => ({ category, names }) as TalentGroupDisplay);
  })();
</script>

<div class="flex-1 overflow-y-auto mt-1 text-sm">
  {#if !treeGroups.length && !talentGroups.length && !commonKnowledge.length}
    <div class="text-gray-400 text-xs">
      Nothing picked yet - check a Career above, then use Manage to add Skill Tree nodes and Talents.
    </div>
  {/if}

  {#each treeGroups as g (g.tree)}
    <div class="mb-1">
      <span class="font-bold">{g.tree}:</span>
      {#each g.nodes as n, i (n.label)}
        <span class="cursor-help" title={n.desc || "Full text not captured yet - see the book."}>{n.label}</span
        >{i < g.nodes.length - 1 ? ", " : ""}
      {/each}
    </div>
  {/each}

  {#each talentGroups as g (g.category)}
    <div class="mb-1">
      <span class="font-bold">{g.category}:</span>
      {#each g.names as n, i (n.label)}
        <span class="cursor-help" title={n.desc || "Full text not captured yet - see the book."}>{n.label}</span
        >{i < g.names.length - 1 ? ", " : ""}
      {/each}
    </div>
  {/each}

  {#if commonKnowledge.length || missingCK.length}
    <div class="mt-2 pt-1 border-t">
      <span class="font-bold">Common Knowledge:</span>
      {#each commonKnowledge as k, i (k.name)}
        <span class="cursor-help" title="From: {k.from.join(', ')}">{k.name}</span>{i < commonKnowledge.length - 1 ? ", " : ""}
      {/each}
      {#if missingCK.length}
        <span class="text-gray-400 text-xs">({missingCK.join(", ")}: not captured yet - see the book)</span>
      {/if}
    </div>
  {/if}
</div>
