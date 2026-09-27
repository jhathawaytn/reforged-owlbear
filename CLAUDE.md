# Reforged Sheet — Claude Code Handoff

Owlbear Rodeo extension: a character sheet for **Reforged** (working title *Gods of the
Forbidden North*), a Cairn-based TTRPG. Jason is the designer and has final say on rules.
Built for playtesting in Owlbear only (not linked to the Foundry build).

## Ground rules

- **Rules come only from the manuscript** (`PLAYTEST_1_v0.4.pdf`). Never invent ability
  text, costs, or mechanics. If something isn't in the book, leave it blank or flag it
  ("not captured yet - see the book") and ask Jason.
- **Bookkeeping tool, not a rules engine.** Track state and compute obvious totals; don't
  enforce prerequisites or auto-apply effects unless asked.
- **Design reference:** https://github.com/maxpaulus43/owlbear-shadowdark-character-sheet
  — structure, UX, and patterns come from there, adapted to Reforged's rules.
- **Explanations go in hover tooltips**, not captions. Keep the layout compact.
- Fonts: Cinzel for headers only; gameplay numbers in plain bold sans-serif.
- Before handing back any change: `npx svelte-check --tsconfig ./tsconfig.json` and
  `npx vite build` must both be clean. Run `npm test` too if the change touches anything in
  `src/lib/types.ts`, `src/lib/model/ReforgedCharacter.ts`, `src/lib/skillTrees.ts`, or
  `src/lib/utils.ts` - the Vitest suite covers those pure rules functions.
- Jason prefers concise, concrete answers.

## Run it

```
npm install
npm run dev          # serves http://localhost:5173
npm test             # Vitest - pure rules functions (no dev server needed)
```

Owlbear: Profile → My Extensions → Add custom extension →
`http://localhost:5173/manifest.json`. `vite.config.ts` sets `server.cors: true` — required,
or Owlbear shows "Failed to fetch". If `public/manifest.json` changes (size, title, icon),
remove and re-add the extension.

**Live for the team:** `https://jhathawaytn.github.io/reforged-owlbear/manifest.json` —
public repo at `github.com/jhathawaytn/reforged-owlbear`, auto-deployed by
`.github/workflows/deploy.yml` on every push to `main` (build → GitHub Pages, no manual
step). `vite.config.ts`'s `base: "./"` and the manifest's/`Notifier.ts`'s relative paths
exist specifically so this works under a Pages project subpath instead of a domain root -
don't reintroduce a leading `/` in those paths.

## Stack & architecture

Svelte 3 + TypeScript + Tailwind + Vite. Two entry points: `index.html` (sheet) and
`popover.html` (roll-result toast).

- **Persistence:** `OBR.player.setMetadata` (3 save slots). The GM sees every player's
  sheet via `OBR.party` (read-only). Outside Owlbear it falls back to localStorage.
- **Rolls** broadcast to the room via `OBR.broadcast` and show an OBR popover toast.
- **New character fields:** add a default in `defaultPC()`. Loads go through
  `withDefaults()`, so older saves pick up the new field instead of breaking.

| Path | Purpose |
|---|---|
| `src/App.svelte` | Whole layout: 3-column grid, header buttons |
| `src/lib/types.ts` | Character type, Conditions, Injuries, Usage Dice, Quality/Condition helpers |
| `src/lib/model/ReforgedCharacter.ts` | `defaultPC`, `withDefaults`, slot/Armor math, undo store |
| `src/lib/compendium.ts` | Ch.9 equipment tables (Gear shop) |
| `src/lib/careers.ts` | 4 playtest Careers, Signature Weapons, Talent Access |
| `src/lib/skillTrees.ts` | All 11 trees: node names + full hover text, XP costs, Rank prerequisites |
| `src/lib/talents.ts` | All 30 playtest Talents' effect text |
| `src/lib/services/OBRHelper.ts` | OBR metadata sync, GM roster, HP nudge write-back |
| `src/lib/**/*.test.ts` | Vitest suite over the pure rules functions (`npm test`) |
| `src/lib/services/Notifier.ts` | Room broadcast + popover toast |
| `src/lib/components/GearView.svelte` | Gear table, burden bar, injury rows, Qual./Cond. |
| `src/lib/components/UsageDiceView.svelte` | Usage Dice panel |
| `src/lib/components/gear/GearShopButton.svelte` | Searchable Gear shop modal |
| `src/lib/components/HPView.svelte` | HP, Catch Your Breath, Rest |
| `src/lib/components/SkillsTalents*.svelte` | Manage picker + on-sheet summary |

`README.md` has the full "modeled accurately / simplified / next steps" record.

## Current task

**Overburdened's HP effect (Appendix A) is now real.** "Your HP is immediately reduced to 0"
was previously just tooltip text - the HP box now actually shows 0 (red, input disabled)
while filled slots exceed STR, and reveals the real stored value again the moment that's no
longer true. Implemented as a pure display override in `HPView.svelte` (`isOverburdened($pc)
? 0 : $pc.hitPoints`) - `hitPoints` itself is never touched, so nothing needs to be
"restored." The other half of that same rule - "incoming damaging Actions strike STR
directly instead of HP" while Overburdened - is **not** wired up yet; Take Damage still
always resolves to HP. Flag if that's worth doing too (bigger change - the whole Damage
Sequence would need an Overburdened branch).

**Six backlog items shipped in one pass** (all but the Travel panel, which is next):

1. **Attacks & Techniques table width** — Notes moved to a compact second line under the
   weapon name (same pattern the Condition annotation already used) instead of its own
   column; the Roll cell's buttons wrap instead of forcing horizontal scroll.
2. **Gear zone warnings** — a new row under the GEAR header shows each zone's used/cap
   (Hand 2, Handy 2, Worn floor(STR/2), Backpack = remainder, §9.1.2), red when overfilled.
   `zoneCapacity()`/`slotsForZone()` already existed and were unused until now.
3. **Armor box rework** — `ArmorView.svelte` now lists equipped Armor pieces with Condition,
   an Armor Wear status (Iron Discipline only, correctable by hand - normally set by Take
   Damage's Deflect resolution), and checkboxes for Mortal Wound/Doom/Impaired-next-action/
   Tempered, which previously had no persistent home outside Take Damage's modal. Also wired
   up Tempered (Scar 12) into Level Up's HP Growth roll - roll twice, keep the higher, then
   the flag clears - which a code comment had flagged as "not wired up yet" from an earlier
   session.
4. **Vitest suite** — `npm test` runs 75 tests over the pure rules functions (`src/lib/*.test.ts`,
   `src/lib/model/ReforgedCharacter.test.ts`): Save resolution, Condition/Quality tracking,
   Attribute Growth, coin burden, Technique capacity/lifecycle, Iron Discipline/Deflect,
   Level Up availability, `withDefaults` migration, Skill Tree prerequisites. Writing it
   caught a real bug in `rollSave` (`src/lib/utils.ts`): Advantage/Disadvantage's `otherRoll`
   was always literally the second physical roll, not "whichever die wasn't kept" - so
   whenever the second roll happened to be the extreme (kept) one, the UI showed the same
   number twice instead of the actual discarded roll. Fixed to report min/max of the pair
   correctly. The Playwright + mocked-OBR-SDK pass from `TESTING.md` is still open - a bigger,
   separate lift (mock SDK module, GM+Player dual context) worth its own session.
5. **Character Creator step rail** — a sticky 1-16 nav down the left side of the wizard modal,
   ticked green from the same completion checks as the Summary, click to jump to that step -
   no more scrolling the whole 16-step wizard to see what's left or find your place.
6. **Grab-bag rules gaps**:
   - *Other Rest effects (§14.9)*: Comfortable Rest now restores 1 lost Attribute point (up to
     its unreduced maximum, player picks which); Normal/Comfortable Rest also heals Light
     Injuries, gated on an accessible Medical Usage Die stock (same pattern as Water gating
     Catch Your Breath). HP restore/Strain clear still reuse Catch Your Breath's mechanic.
   - *Coin burden (§9.1.5)*: each denomination now adds slots independently once past its free
     threshold (`coinBurdenSlots()` in `types.ts`) - Farthing 1,000/2,000, Silver Penny
     250/500, Gold Piece 25/100, Gold Crown 1/25 (free threshold / coins-per-slot-above). Coin
     box header shows the current burden.
   - *Prerequisite warnings (§7.7)*: a Skill Tree node whose Rank-gate prerequisite isn't met
     gets an orange warning triangle with the exact reason on hover - warning only, never
     blocked, same philosophy as every other soft cap on this sheet.
   - *GM write-back MVP*: there's no API to write into another client's player metadata
     directly, so this is a room broadcast (`sendHPNudge` in `OBRHelper.ts`) that only the
     addressed player's own client applies, to its own live sheet. Exposed as a small HP +/-
     control per player row in the Players modal (GM-only). Trust-based like every other
     broadcast this extension sends - no real auth on an OBR room message. Broader write-back
     (arbitrary fields, not just HP) stays backlog if it's ever needed.

**Attribute maximums (§7.5/§14.4) shipped**, closing the Level Up simplification noted below.
`ReforgedCharacter` gained `attributeMax: Record<Attribute, number>` - the "unreduced
maximum" Attribute Growth checks against. It's kept in lockstep with `attributes` through
every Character Creation increase (roll, swap, Age, Formative Experience, Questionnaire) and
by Growth itself, but a Permanent Injury lowers `attributes` directly without touching it -
so the gap between them IS the injury reduction, and Growth still checks the true pre-Injury
ceiling. `LevelUpButton.svelte` now rolls 3d6 against `attributeMax`, not the possibly-reduced
current value. GearView's Injury rows gained the §14.4 Permanent Injury by Location table
(Leg/Off-hand → DEX, Sword Arm/Torso/Internal → STR, Head → INT or WIL by GM/player choice)
with a one-time "Apply -1 {Attribute}" button (Torso also applies -1 max HP) - not derived,
so editing/removing the row afterward never silently reverses it. The STR/DEX/INT/WIL boxes
show "(max N)" only once it's diverged from current. Also corrected `INJURY_HEALING.Permanent`,
which claimed a "(floor 3)" that isn't anywhere in the manuscript - removed.

Also fixed while verifying a batch of external review notes (see below): Formative
Experience's 18-cap now redirects a blocked +1 to the other listed Attribute instead of
losing it silently (§3.2, matching the Questionnaire's already-correct behavior); Hamlet
Connection was missing its 5th question ("What place in the Hamlet matters to you?", §3.11 -
now 6 of 6); Company Connection gained its optional 6th field (a personal connection to
another specific PC already joining the table, §3.12's trailing paragraph); the Character
Creation Summary now matches §3.13 exactly (added back "Recorded Common Knowledge, Tree
Access, and Talent Access..." and renders Arcane-only items as a grey N/A instead of a false
green checkmark on non-Arcane characters); "Resolved any additional Career Picks" no longer
shows done before Age is even rolled; SkillsTalentsPicker's empty-state text no longer says
"on the sheet (under CAREERS)" when it's actually embedded in the Character Creator wizard.

**Level Up helper (§7.4–§7.5) shipped.** Level no longer auto-follows XP Earned - meeting a
threshold just turns the LEVEL box's number red and reveals a "Level Up" button
(`LevelUpButton.svelte`). That opens a modal to roll 1d6 HP Growth and 3d6 per Attribute
(Attribute Growth), each Attribute growing if its roll beats its unreduced maximum (and it's
below 18); if none grow, one Attribute tied for the lowest grows instead (ties are a manual
pick), unless every Attribute is already 18. Confirming advances `pc.level` by exactly one
(matching §7.4's one-Level-per-session intent - not session-enforced, but no longer able to
skip levels just by raising XP Earned) and broadcasts a summary.

**From that same external review pass (GPT), two items didn't apply and stay closed:** the
reported Gear-vs-Conditions slot-count mismatch (both already read from the same
`filledSlots`/`inventoryCapacity` functions - couldn't reproduce), and a "greyed Longsword row
with no Stress button" (no such placeholder row exists in this codebase for an unowned
Signature Weapon - couldn't reproduce, possibly a different build or a misread). Everything
else that review surfaced is done - see the six items at the top of this section.

**Play mechanics, sheet side is done** (Ch.9/Ch.13/Ch.14) — damage intake, Reactions, attack
resolution, Gambits, and the combat lifecycle/Techniques all shipped, each planned (exact
rules, ambiguities, click counts) before building. Summary, newest first:

- **Combat lifecycle & Techniques** — the Technique box (now labeled COMBAT) gained a
  Start/End Combat button and a Stage tracker (Initiative → Clash → Fray, looping on new
  Fray Rounds). Real per-Technique tracking replaced the old plain pip counter: overall
  capacity by Level, each of the 9 named Techniques usable only once per combat, and at most
  one Technique per Initiative/Clash/Fray-Round - all three enforced together via
  `canUseTechnique`/`useTechnique` in `ReforgedCharacter.ts`. Ending combat clears Strain
  (§13.11.4) and resets both trackers. Five Techniques (Take the Initiative, Seize the
  Advantage, Save Your Energy, Press the Advantage, Desperate Effort) are used from the
  Combat modal; the other four modify a specific roll, so they live at the point of that
  roll instead - Act Decisively/Tactical Consideration as buttons on each Attacks &
  Techniques row, Defensive Maneuvering/Hold Fast offered automatically inside Take Damage.
- **Damage intake, Defensive Reactions, attack resolution, Gambits** — `TakeDamageButton.svelte`
  opens on a Reaction picker (§13.7) feeding the full §13.10/§14.1-14.6/§14.18 damage chain
  (Armor, Deflect, HP, STR overflow, Mortal Wound/Doom, Critical STR Save, Scars). Attacks &
  Techniques rows link back to their Gear row (`gearId`) for live Condition-based die
  stepping; `WeaponStressButton.svelte` and `GambitButton.svelte` per row cover §9.4.6 and
  §13.9.

See README's "What's modeled accurately" for the full breakdown and what's still explicitly
deferred (Stabilization/Clinging/Death, a Scars/Doom review table, Precise/Guarding, Loading
weapons, per-shot ammo, Counter-Gambits, Gang Up's Gambit rule, Reach/Blast). A GM combat
extension proper (enemy/initiative tracking as GM state, not just an HP nudge) still stays
backlog. See `TESTING.md` for the full acceptance bar: the Vitest suite is now real (`npm
test`, above), but the Playwright-against-a-mocked-OBR-SDK pass, the manual Owlbear checklist,
the click-budget table, and the rules-ambiguities list for Jason are all still open. Pick the
next Backlog item (Travel panel is up), or continue `TESTING.md`'s remaining acceptance work,
when ready.

**Debugging note for next time:** a page-level shared variable driving a reused `Menu`
component (from `Menu/Menu.svelte`) is fragile - its `<svelte:body on:click>` click-outside
handler stays mounted through the same synchronous event that opens a *different* trigger's
menu, so the old instance's close-on-outside-click fires after the new open and stomps it.
Fixed here by giving `WeaponStressButton.svelte` its own local menu state per instance
(matching `RollButton.svelte`'s proven pattern) plus a small shared store just to close
sibling instances. Reach for that pattern first, not a single shared `Menu` instance, if
another list-of-rows-each-with-a-context-menu need comes up.

Previous task (done): Equipment and Usage Dice now live on a second page, opened by the new
icon button under the "Reforged" title. `GearView` (Fatigue/Injury burden bar, Backpack
toggle), `UsageDiceView`, and Coin all moved there; the Gear box's "X slots, Y free /
OVERBURDENED" stays visible on the main sheet via the Conditions box header.

## Rules decisions Jason has confirmed

- Saves: roll d20 under the Attribute; natural 1 always succeeds, natural 20 always fails.
  Advantage keeps the lower of 2d20, Disadvantage the higher. "This roll" modifier resets
  after each roll.
- Inventory capacity = STR; Overburdened only when filled slots **exceed** STR.
- Fatigue = 1 slot each. Injury = 1 slot each. Both sit in the Fatigue & Injury zone,
  always count against STR, and are **not** dropped with the Backpack.
- Only Normal or Comfortable Rest clears Fatigue; Perilous Rest does not.
- Catch Your Breath needs an accessible Water stock (rolls its Usage Die), restores HP,
  and clears Strain. No Water → Deprived, nothing restored. Strain clears via Catch Your
  Breath, Rest, or ending combat (§13.11.4 - "once the encounter has genuinely ended").
- Depleted Usage Die items: containers (Water, Medical, Repair kits) keep their slot;
  pure consumables (Rations, torches, oil, fodder, ammo) free it.
- XP: Available (left box) is what purchases spend; Earned (right) never decreases.
  "free" checkbox in the picker = Career Pick, no XP spent.
- Ancestry is a fixed dropdown of 4 (Tough, Arcane, Cunning, Adaptable); Heritage is free text.
- Technique capacity by Level: 1–2 → 1, 3–4 → 2, 5–7 → 3, 8–10 → 4 (pip row in Combat).
- A second Severe Injury at the same site **may** become Permanent (GM call, not automatic).
- Conditions box stays as a reference. Integration with the "Marked!" token-tag extension
  was considered and dropped (undocumented, closed-source data format).

## Backlog (after the current task)

1. **Travel panel** — separate, GM-run, Company-level (Ch.11): Day/Quarter tracker, Pace,
   Known Route vs. Unmapped, Weather + carry-over modifier, roles (Trailblazer, Watch,
   Quartermaster) and Quarter Activities, daily ration/water checklist, event log.
   It can't write to players' sheets yet, so prompt players to roll their own Usage Dice.
2. **`TESTING.md`'s remaining acceptance work** — Playwright against a mocked OBR SDK (GM +
   Player contexts side by side), the manual Owlbear checklist, the click-budget table, and
   the rules-ambiguities list for Jason. The Vitest half is done (`npm test`).
3. **A real GM combat extension** — enemy/initiative tracking as GM-side state, beyond the
   HP-nudge write-back MVP that now exists (Players modal, GM-only).
4. Broader GM write-back (arbitrary fields, not just HP) if the HP nudge proves useful enough
   to want more of it.

## Known data gaps

- Short Water Barrel is simplified to one d6 (the book has 4× d6 Water stocks).
