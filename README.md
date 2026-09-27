# Reforged Sheet

An unofficial character sheet for **Reforged** (Gods of the Forbidden North), built as an
Owlbear Rodeo extension.

Architecture is a close port of
[maxpaulus43/owlbear-shadowdark-character-sheet](https://github.com/maxpaulus43/owlbear-shadowdark-character-sheet):
**Svelte + TypeScript + Tailwind**, one character per player (no roster/home page),
persisted via `OBR.player.setMetadata` (which Owlbear syncs to the GM automatically
through `OBR.party`), undo/redo, save slots, and roll results announced to the room via
`OBR.broadcast` + a native OBR popover toast.

## Why this shape

- **One character per player, not a list.** Each player has one active sheet (plus up to
  3 save slots for alternate builds), matching how most people actually use a VTT sheet.
- **Persistence via OBR player metadata, not a custom sync channel.** `OBR.player.setMetadata`
  is the mechanism Owlbear provides specifically for this — the GM's client sees every
  player's metadata through `OBR.party`, so there's no broadcast/IndexedDB machinery to
  maintain. The GM can "Load" any player's sheet to view it (read-only in this build — see
  Next Steps).
- **Rolls are native OBR events.** Clicking a Save roll fires `OBR.broadcast` (so everyone
  in the room sees it) and opens a small OBR popover toast, the same UI Owlbear itself
  uses for transient messages — rather than a custom sidebar.

## Getting started

```bash
npm install
npm run dev
```

Point Owlbear's "Add a custom extension" at `http://localhost:5173/manifest.json` while
the dev server is running (see the vite.config.ts comment — CORS is explicitly enabled
for this). For a real deployment, `npm run build` and host `dist/` (GitHub Pages works
fine), then point the manifest at that URL instead.

`npm test` runs the Vitest suite over the pure rules functions (`src/lib/**/*.test.ts`) - no
dev server or Owlbear needed.

## Project layout

```
public/manifest.json         Owlbear extension manifest
index.html / popover.html    two Vite entry points - main sheet, and the roll-toast popover
src/App.svelte               the whole sheet layout (3-column grid, no routing)
src/popover/Popover.svelte   tiny toast that shows a roll result from a URL query param
src/lib/types.ts             the ReforgedCharacter shape + Ch.9 gear/burden/zone constants
src/lib/model/ReforgedCharacter.ts   default character + inventory-capacity calculations
src/lib/services/
  OBRHelper.ts        player-metadata persistence, GM party roster, roll broadcast listener
  LocalStorageSaver.ts fallback persistence when running outside Owlbear (npm run dev alone)
  PlayerHistoryTracker.ts  generic undo/redo store wrapper
  Notifier.ts         broadcasts + shows the popover toast for a roll
  SaveSlotTracker.ts / SettingsTracker.ts / NotificationLogger.ts / FileSaver.ts / JSONImporter.ts
src/lib/components/    StatView, RollButton, HPView, ArmorView, StrainView, TechniqueView,
                        AttacksView, GearView, CurrencyView, PlayersView, OptionsButton,
                        NotesButton, NotificationsButton, Modal, Menu/*
```

## What's modeled accurately (pulled from the manuscript, not guessed)

- **Skills & Talents (Ch.4-7)** — CAREERS is checkboxes for the 4 real playtest Careers
  (Blacksmith, Hedge Knight, Thief, Scout), each with its real Common Knowledge, Signature
  Weapon, and Talent Access pulled from the book. Checking a Career opens up its real
  Skill Trees and Talents in the "Manage" picker. **All 11 Skill Trees are fully named
  with real mechanical text as a hover tooltip** — every Rank, Branch, and Mastery across
  all 143 nodes, straight from Chapter 5. **All 30 Talents in this playtest build also
  have real effect text on hover**, pulled from Chapter 6 — Combat, Exploration, Social,
  and Tricks & Subterfuge, complete. Hover works both in the "Manage" picker and directly
  in the on-sheet summary list, no need to reopen the picker to remember what something
  does. Each row has its own small "free" checkbox for taking it as a Career Pick during
  character creation (or any other free grant) — check that first and the XP cost is
  skipped entirely; leave it unchecked and checking the item spends its real cost from XP
  Available immediately, refunded if you uncheck it. The main SKILLS & TALENTS box shows
  everything you've actually picked, grouped by tree/category, instead of requiring you to
  reopen the picker to see what you have.
- **Career Questionnaire (§3.8, Ch.4)** — the first Career selected in "Manage" gets its
  real 4-Beat Questionnaire (Formative Influence, Early Hardship, Career Years, Breaking
  Point) with all 24 rollable d6 options per Career (96 total across the 4 playtest
  Careers), pulled straight from each Career's Ch.4 entry. Roll or pick each Beat, record
  its "names someone/something" note or Breaking Point hook, then Apply its +1 Attribute
  (respecting the Attribute Maximum of 18). One reroll is allowed across the whole
  Questionnaire, matching the book's limit exactly.
- **Character Creator (Ch.3, §3.1–§3.13)** — under Options → Advanced Options, a full
  guided walkthrough of all 16 character-creation steps in book order, in one modal, bound
  live to the same sheet fields (nothing is a separate copy). Covers Attribute generation
  (2d6+3 ×4 with the one-time optional swap), starting Hit Protection (1d6), Age (1d6, with
  its Attribute Adjustment/Career Picks/Starting XP shown), Defining Trait (real d66 table,
  36 entries, one reroll), Formative Experience (the book's two sample presets plus a
  +1/+1/−1 Attribute helper), Ancestry/Heritage (plus the Arcane Ancestry's established
  feat), a computed Languages slot hint from INT, Name, Careers/Career Picks/the
  Questionnaire (reusing the same picker as "Manage"), an Identity recap (with a "Add to
  Hooks" button for the Questionnaire's Breaking Point, and a notes field for the book's 5
  reflection questions — both share the same Hooks/Notes fields as the main sheet's Notes
  button), Starting Equipment, Hamlet Connection and Company Connection (the book's 5
  prompts each, each optional individually but at least one per section expected), and a
  live Character Creation Summary checklist matching the book's real §3.13 checklist
  item-for-item (21 items — Attribute Maximum verification, Arcane feat, Signature Weapon,
  a Trinket for each distinct Career, additional Career Picks, and the Breaking Point hook
  included, not just the obvious rolls). Two-click arm/confirm before it erases the current
  save slot to start fresh — never a silent overwrite. A separate header icon (no erase)
  resumes an in-progress character. Every one-time roll/apply action (Attributes, the
  Attribute swap, HP, Age's Attribute Adjustment, Defining Trait roll/reroll, Formative
  Experience, Starting Equipment, each Career's Signature Weapon and Trinket roll) locks
  itself after use, persisted so the lock survives closing and reopening the wizard. Age's
  Attribute Adjustment respects both the Attribute Maximum (18) and the Attribute Floor (6,
  §3.3 — a penalty is ignored entirely once an Attribute is already at or below 6, and
  never raises one back up to it). The "free" Career Pick checkbox in the Skill/Talent
  picker locks out once the Age-granted budget is spent — until the wizard's Finalize step
  lifts that cap for Advancement while locking the rest of the one-time actions for good.
  Each Career selected also gets a "Roll Trinket (d4)" button in the Skill/Talent picker
  (shared by the wizard and the standalone "Manage" button) — a petty item with no
  mechanical effect, from that Career's own d4 table, locked once rolled.
- **Background Summary** — a new box (between Skills & Talents and Attacks & Techniques)
  that reads the Career Questionnaire's 4 Beats and Hamlet/Company Connection back as a
  first-person narrative, in that order. (Defining Trait, Formative Experience, and
  Ancestry/Heritage already have their own boxes on the sheet, so they aren't repeated
  here.) The Questionnaire's option text is reworded from the book's "you" address to "I"
  so it reads as the character's own background; every option that asks you to name or
  describe something carries its own `detailTemplate`, so a typed answer becomes a real
  sentence ("Old Roderick was the one who protected me.") instead of the book's raw
  "Name X" instruction sitting next to a bare answer. Hamlet/Company Connection answers
  run the same way through a first-person sentence template per question (e.g. "{answer}
  knows me in the Hamlet very well."). Anything not filled in yet is skipped, and
  sentences are capitalized so joined prose never dips into a lowercase mid-word from a
  typed answer. A pencil icon lets you edit the assembled text directly for small
  touch-ups — once saved, that edit sticks instead of being recomputed, with a "Reset to
  auto-generated" option to discard it and go back to the live version.
- **Level & the Level Up helper (§7.3–§7.5)** — the real 10-row Level table (Novice through
  Visionary) is shown under the LEVEL box. Level no longer jumps the moment XP Earned crosses
  a threshold (§7.4 - meeting one doesn't grant it "in the field"): the box's number turns red
  and a "Level Up" button appears instead, opening a roll-and-apply helper for HP Growth
  (1d6) and Attribute Growth (3d6 per Attribute against its unreduced maximum, with the
  no-natural-growth fallback to the lowest Attribute). Confirming advances Level by exactly
  one. The return-to-a-settlement and 1-Level-per-session requirements aren't enforced,
  matching the rest of the sheet.
- **Equipment Quality & Condition (§9.3)** — Weapons and Armor added from the Gear shop
  (or their Career's Signature Weapon, below) get real Quality (Shoddy/Standard/
  Masterwork) and Condition (Healthy/Damaged/Broken/Destroyed) tracking, with −/+ buttons
  to repair/degrade. This isn't automatic — "routine competent use does not randomly
  degrade equipment" per the book, so nothing ticks down on its own; it's there to record
  what an ability or the fiction actually did. The mechanics are real: Shoddy items go
  straight to Destroyed on their first hit, Masterwork absorbs one degradation for free
  (shown as "+Reserve" until spent) before following the normal track, and Broken armor
  correctly drops out of the computed Armor total (Damaged armor doesn't - it still gives
  full protection per §9.13).
- **Signature Weapon auto-add** — each Career card in the "Manage" picker now has an
  "+ Add Signature Weapon" button that drops the real weapon (Blacksmith's Heavy Work
  Hammer, Hedge Knight's Knight's Longsword, Thief's Hidden Stiletto, Scout's Hunting
  Bow) into both Gear (equipped, Standard/Healthy) and Attacks & Techniques in one click,
  with its real damage die, type, and special quality (Self-Made, Veteran, Maintained).
- **Fatigue & Injury (§9.1.2, §14.4, §14.9)** — a burden bar in the Gear box tracks
  Fatigue (1 slot each) and Injuries (1 slot each, with severity Light/Severe/Permanent and
  a d10-table location; Severe shows its location penalty on hover). They sit in their own
  Fatigue & Injury zone, always count against STR, and are never dropped with the Backpack.
  A "Backpack dropped" toggle removes Backpack-zone items from the slot total. The Rest
  button now takes a quality: only Normal or Comfortable Rest clears Fatigue, Perilous
  doesn't. A Permanent Injury row shows the §14.4 Attribute it maps to (Leg/Off-hand → DEX,
  Sword Arm/Torso/Internal → STR, Head → INT or WIL, GM's call) and a one-time "Apply -1"
  button that actually lowers it (Torso also drops max HP by 1) - a deliberate one-time
  action, not auto-reversed if the row is edited or removed afterward, since only high-rank
  Healing (not modeled) can undo it. Fresh Rations (d6, spoils on settlement entry) added to
  the Gear shop.
- **Rest and Recovery (§14.9)** — Rest's Comfortable tier restores 1 lost Attribute point (up
  to its unreduced maximum; you pick which), and Normal/Comfortable Rest also heals every
  Light Injury, gated on an accessible Medical Usage Die stock the same way Water gates Catch
  Your Breath (no stock, no healing this Rest - not Deprived, just unhealed).
- **Armor box (§9.5.7, §13.10.3, §14.2, §14.5, §14.6)** — beyond the total A-value, it lists
  equipped Armor pieces with their Condition, an Armor Wear status for Iron Discipline
  (normally set automatically by Take Damage's Deflect resolution, correctable by hand), and
  checkboxes for Mortal Wound, Doom, Impaired (next Action), and Tempered - state that used to
  only be visible mid-flow inside Take Damage's modal. Tempered now does something: the next
  time HP Growth is rolled (Level Up), it rolls twice and keeps the higher result, then clears.
- **Skill Tree Rank prerequisites (§7.7)** — a node whose prerequisite isn't met (its own
  Rank gate for a Branch, R4 for a Mastery, or the full "lower gates + a Branch from each" for
  a higher Rank gate) shows an orange warning with the exact reason on hover. Warning only,
  same "bookkeeping tool" philosophy as every soft cap on this sheet - checking it anyway
  isn't blocked.
- **GM HP nudge (Players modal, GM-only)** — since there's no API to write into another
  client's player metadata directly, this sends a room broadcast that only the addressed
  player's own client applies, to their own live sheet (they need the extension open to
  receive it). The first real GM write-back path on this sheet, scoped to HP for now.
- **Conditions (Appendix A)** — a toggle grid for the core status Conditions (Bleeding,
  Blinded, Clinging, Deafened, Deprived, Entangled, Prone, Rattled, Stunned), each with its
  real effect text on hover, plus Dazed (ability-granted, e.g. Bashing R2B, clearly marked
  as not core). Overburdened isn't a manual toggle - it's a live indicator driven by the
  same Inventory-vs-STR computation the Gear box already uses. Clicking a condition just
  marks it active; nothing here enforces its effect automatically, same "bookkeeping tool"
  philosophy as the rest of the sheet.
- **Ancestry (Ch.3, §3.6)** is a fixed dropdown of the actual 4 options — Tough, Arcane,
  Cunning, Adaptable — each with its real once-per-session benefit shown as a tooltip/note.
  Heritage stays free text since the book explicitly leaves it open ("Dwarf, Halfling,
  Elf, Goblin, or another heritage you and the GM establish").
- **Saves (Ch.2, §2.5–2.7):** roll d20 + modifier, succeed on a result ≤ the Attribute.
  A natural 1 always succeeds and a natural 20 always fails, *regardless of modifiers* —
  the roll button implements this override.
- **Advantage/Disadvantage:** right-click (or press-and-hold on mobile) a Save roll for
  Advantage (roll 2d20, keep the *lower*) or Disadvantage (keep the *higher*) — inverted
  from the usual direction because this is a roll-under system.
- **Inventory capacity = current STR** (§9.1.1), computed live from the STR field, not a
  manually-set number. Overburdened is flagged automatically once filled slots exceed it.
- **Burden** (Petty=0 / Standard=1 / Bulky=2 slots) and the four **Inventory Zones**
  (Hand/Handy/Worn/Backpack, §9.1.2) are tracked per gear item, with the zone soft-caps
  shown (Hand 2, Handy 2, Worn ⌊STR÷2⌋).
- **Strain** (§13.11) has no max — it accumulates during a fight, each point costs one
  Inventory Slot, and there's a one-tap "Clear Strain" for when the encounter ends.
- **Technique capacity by Level** (§13.6.1, the 1–2/3–4/5–7/8–10 → 1/2/3/4 table) is
  computed automatically from the Level field, with a used-this-combat counter and a
  "Reset (new combat)" button.
- **Coin is four real denominations** — Farthing, Silver Penny, Gold Piece, Gold Crown
  (§9.1.5) — not a generic two-currency stand-in. Coin Burden is computed too: each
  denomination adds slots independently once past its own free threshold (Farthing
  1,000/2,000 free/per-slot-above, Silver Penny 250/500, Gold Piece 25/100, Gold Crown
  1/25), never combined into one total value first. The COIN box header shows the burden.
- **Gear picker backed by the real Ch.9 Equipment Tables** (§9.11.1–9.11.9): Melee/Ranged
  Weapons, Armor, Ammunition, Containers, Utility Gear, Food & Water, Light Sources, and
  Medical/Repair gear — searchable and filterable by category, matching the reference
  sheet's shop-style picker. Adding a weapon auto-creates a matching row in Attacks &
  Techniques with its real damage die, damage type, and properties. Adding armor and
  checking its "Eq." box feeds directly into the computed Armor total.
- **Usage Dice (§9.3.4).** Rations, Water, Ammunition, Torches, Lamp Oil, Fodder, and kit
  supplies added from the Gear shop carry their real starting die and show up in their own
  panel with a "Check" button: roll the die, step down one size on a 1–3
  (d12→d10→d8→d6→d4→depleted), same as the book. A restock button resets to the item's
  starting size. A depleted item's row dims with an EMPTY/USED UP tag; whether it stops
  occupying its slot depends on what it actually is (not stated as a rule in the
  manuscript, but a reasonable reading): a container-based resource (Waterskin,
  Physicker's Kit, Repair Kit) keeps its slot, since the empty container is still there —
  a pure consumable (Rations, a Torch Bundle, Lamp Oil, Fodder, Ammunition) frees it, since
  there's nothing left to carry once it's used up.
- **Catch Your Breath actually costs what the rule says (§14.1).** It finds an accessible
  Water stock (a Waterskin, say), rolls its Usage Die, steps it down if needed, and only
  then restores HP. With no accessible Water stock, it refuses to restore HP and says so —
  matching "the character becomes Deprived and cannot Catch Their Breath."
- **Take Damage (§13.10, §14.1-14.6, §14.18)** — a guided modal from the HP box that runs
  one hit through the book's real Damage Sequence and HP-to-STR chain, in order: an optional
  Shield Sacrifice (destroys a full Shield, not a Buckler, to negate the whole hit) once the
  damage number is known; Armor (auto-subtracted, or skipped if the Action ignores Armor);
  Deflect (pick one eligible equipped armor piece, prevent up to 2, Deflective pieces cost
  only 1 Condition step for either amount instead of 1-per-point, and Iron Discipline's
  shared Armor Wear box absorbs every other step before Condition actually advances); then
  HP, then STR overflow. On STR overflow: Edge-Proof reduces Slashing/Piercing overflow by 1
  (not if the Action ignores Armor); STR reaching 0 is Slain immediately, no further
  resolution; otherwise a qualifying Mortal Wound (≥ half current STR) sets a persistent flag
  instead of a Critical Save — a second qualifying hit, or any qualifying hit while carrying
  a Doom Scar, is instant death; otherwise a real Critical STR Save (the same `RollButton` as
  every other Save, so Advantage/Disadvantage and Talent rerolls still work) - failure rolls
  the Injury Site Table and adds a real Severe Injury row. If the hit instead empties HP to
  *exactly* 0 with no overflow, it rolls a Scar on the die that caused it (the full d1-12
  table, including cascades to a Light/Severe/Permanent Injury, a fixed Severe Head Injury,
  the Stunned/Doom/Tempered flags) - Scar Attribute loss is explicitly not Damage, so it
  never re-triggers a Critical Save, Mortal Wound, or another Scar, only the STR-0 check.
  Stabilization, Clinging, and the Death/Successor/Will/Relic chain (§14.7, §14.10-14.17)
  aren't wired up yet - a Mortal Wound just leaves a note to resolve stabilization by hand.
- **Defensive Reactions (§13.7, §13.11.2)** — Take Damage opens on a Reaction picker, one
  choice per incoming Action, matching the book's Strain costs (Defend free; Block, Dodge,
  Parry, and Fight Back each 1 Strain, charged immediately). Block and Dodge replace the
  attacker's weapon die with a fresh 1d4 (a button rolls it for you) that then runs through
  the normal Armor/Deflect/HP/STR chain unchanged. Fight Back resolves the incoming hit
  normally and reminds you to make your free melee Action afterward in Attacks &
  Techniques. Parry is the real contest from §13.7.5: pick one of your own Attacks &
  Techniques rows (or enter a number by hand) and roll it against the attacker's given
  damage - the higher result wins, the loser takes the winner's roll straight to STR
  (ignoring Armor and HP, never triggering a Critical Save/Mortal Wound/Scar), and a tie is
  no exchange. Shield Sacrifice is offered as a sixth Reaction choice, resolved after the
  damage number is known per its own §9.5.5 timing, exactly as before. Gambits and
  Techniques (including Defensive Maneuvering's -1 Strain on a Reaction) aren't wired up
  yet.
- **Attack resolution (§9.4.2, §9.4.6, §9.13)** — Attacks & Techniques rows bought from the
  Gear shop or granted as a Signature Weapon now link back to their Gear row, so rolling one
  automatically reads its live Condition instead of a static string that could drift out of
  sync: Damaged steps the native die down one size (d10→d8→d6→d4, Profile unchanged), Broken
  blocks the roll entirely ("no normal damage"). A "Stress" button next to each linked,
  non-Broken weapon offers Weapon Stress (§9.4.6): the two universal options, Drive Through
  and Force Maneuver, on any weapon (their effect is on the defender's Armor/Gambit
  Difficulty, so this just narrates the reminder and degrades the weapon); Brutal (up to 2
  steps, +1 damage each), Cleaving (a second Impaired d4 attack against another target, "no
  chain"), or Vicious (may inflict Bleeding) only when that's the weapon's own Special Stress
  Property, same one-per-weapon rule as the book. Precise and Guarding are the two Special
  Stress Properties used defensively (after Block/Parry) rather than on your own attack -
  they live with Reactions in Take Damage instead, not here yet. Loading weapons (Crossbow
  reload state) and per-shot ammunition checks aren't modeled - the book itself resolves
  ammo Usage Dice once after combat, not per shot, so that's deferred to the combat-lifecycle
  slice.
- **Gambits (§13.9)** — a "Gambit" button on every Attack row (any Action, not gated to a
  linked weapon, only hidden if a linked weapon is Broken/Destroyed) walks through the
  book's real sequence: pick a named Gambit (Disarm, Shove, Trip, Bind, Feint, Blind, Drag,
  or a GM-approved Custom one, §13.9.4) or just read what it does; roll damage (Condition-
  aware, same as a normal Roll); choose how much of that roll to sacrifice as the **Gambit
  Difficulty**, clamped to what was actually rolled; the remainder applies normally. The
  result names the exact Resistance Save condition (succeeds only if the target's result is
  *both* higher than the Gambit Difficulty *and* ≤ their Attribute) for the GM to resolve,
  since this sheet has no enemy/target to apply the actual mechanical consequence (Prone,
  Exposed, Disarmed, etc.) to. Feint's Exposed follow-up is called out explicitly since it's
  the one named consequence with a concrete future-turn rule. Doesn't guess which Attribute
  a given Gambit uses — the book gives four example situations, not a per-Gambit mapping, so
  the modal shows those examples as reference and leaves the actual choice to the GM.
  Counter-Gambits (§13.9.5) and Gang Up's Gambit rule (§13.9.6) need multi-combatant
  tracking this sheet doesn't have, so they're left out entirely, same as Loading weapons.
- **Combat lifecycle and Techniques (§13.0-§13.6)** — the Technique box (now labeled COMBAT)
  gets a Start/End Combat button and a Stage tracker (Initiative → Clash → Fray, looping on
  new Fray Rounds), replacing the old plain used-vs-capacity pip counter with real per-
  Technique tracking. All three of the book's limits apply together: overall capacity by
  Level (unchanged), **each of the 9 named Techniques usable only once per combat**, and **at
  most one Technique total per Initiative, per Clash, or per individual Fray Round** - a rule
  the sheet didn't enforce at all before. Ending combat clears Strain (§13.11.4) and resets
  both Technique trackers - a deliberate manual click, so Strain correctly stays if the
  encounter hasn't genuinely ended. Initiative gets a dedicated "Roll Initiative" button
  (the real DEX `RollButton`) so a failed roll can immediately offer **Take the Initiative**.
  Five Techniques (Take the Initiative, Seize the Advantage, Save Your Energy, Press the
  Advantage, Desperate Effort) are used directly from the Combat modal - only Desperate
  Effort has a real number (+2 Strain), the rest are narrated reminders since their effects
  land on positioning or an off-sheet enemy. The other four modify a specific roll, so they
  live at the point of that roll instead: **Act Decisively** (step the die up one size) and
  **Tactical Consideration** (reroll, keep the second result) are buttons on each Attacks &
  Techniques row, gated to Initiative/Clash respectively; **Defensive Maneuvering** (-1
  Strain on a Reaction) and **Hold Fast** (-3 remaining damage after Armor/Deflect) are
  offered automatically at the right step inside Take Damage, gated to Clash/Fray. All nine
  are still listed with their full text in the Combat modal for reference even when used
  elsewhere.

## What's deliberately simplified

- **Attacks & Techniques still roll from free-text dice notation** (e.g. `d8+1`), and
  Reach/Blast (multi-target, §13.16) isn't wired up - the Roll button just rolls whatever
  notation is in the box, modified by the linked weapon's Condition. Condition-based
  die-stepping, Weapon Stress, Gambits, and all 9 Techniques are real now - see "Attack
  resolution," "Gambits," and "Combat lifecycle and Techniques" above.
- **Armor totals are a simple sum**, not the full stacking rule (§13.13's A4 ceiling).
  Equipped armor pieces sum automatically. (Deflect and Shield/Helm Sacrifice are real now —
  see "Take Damage" above.)
- **Skill Rank Save modifiers aren't automatic** (§2.4's "each Skill Rank subtracts 2 from
  the roll") - the Save roll button has a small "this roll" field you fill in by hand. (The
  Skill Tree picker itself - Rank gates, Branches, Masteries, XP costs, prerequisite
  warnings - is real; see "Skills & Talents" above.)
- **Short Water Barrel is simplified** to one d6 Usage Die instead of the real 4×d6 Water
  stocks it holds (§9.11.7) — tracking four independent dice for one item felt like more
  UI than the case warrants; flag it if that's wrong.
- **Deprived isn't a tracked, persistent condition.** Catch Your Breath correctly refuses
  to restore HP with no Water and says so, but it doesn't set a standing "Deprived" flag
  elsewhere on the sheet the way the full condition rules describe.
- **Enhanced/Impaired** (the separate damage-roll mechanic — extra d10 keep-highest /
  replace with d4, §13.14) isn't wired up, since Attacks don't currently store a base die
  type to modify.

## Next steps

- **GM write-back is an HP-nudge MVP, not a general write path.** Loading a tracked player's
  sheet as GM is still read-only. A GM can send a targeted HP +/- to one player (Players
  modal) via a room broadcast that only that player's own client applies to their own sheet -
  but there's no way yet to write any other field, or to write while offline.
- **Prerequisite checking is a warning, not enforcement** (by design, same philosophy as
  every other soft cap on this sheet) - a Skill Tree node whose Rank-gate prerequisite isn't
  met shows an orange warning icon, but checking it anyway is never blocked.
- **No Scars/Doom/Tempered review table.** Take Damage records these to the character
  (`$pc.scars`, `doomActive`, `temperedPending`) and narrates each one when it happens
  (Tempered now actually doubles the next HP Growth roll and keeps the higher result), but
  there's no table on the sheet to review past Scars later, the way Injuries have their own
  list - flag if that's worth adding. (Mortal Wound, Doom, Impaired-next-action, and Armor
  Wear now have a persistent, editable home in the Armor box.)
- **No Stabilization/Clinging/Death workflow** (§14.7, §14.10-14.17) - a Mortal Wound sets
  a flag and a reminder to resolve it by hand; nothing walks through Stabilize, Clinging,
  or what happens next if a character actually dies.
