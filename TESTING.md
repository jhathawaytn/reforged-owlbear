# Testing Phase — Combat Playthrough (GM + Player)

Run this after the play-mechanics build (damage intake, Strain actions, attacks, Reactions,
combat lifecycle, GM combat extension). Goal: prove the rules resolve correctly **and** that
every common action meets the click budget.

## How to test (Claude Code can't click through live Owlbear)

1. **Rules logic → unit tests (Vitest).** Every rules function is pure and tested:
   damage pipeline, slot math, Strain, Condition steps, Masterwork Reserve, Save resolution
   (nat 1 / nat 20), Usage Die step-down, Technique capacity, level-up rolls. Seed the RNG so
   dice-dependent tests are deterministic.
2. **UI flows → Playwright against the dev server with a mock OBR.** Add a test-only mock of
   the OBR SDK (player metadata, party, broadcast, popover) backed by a shared in-memory bus,
   so a **GM context and a Player context run side by side** in one test and see each
   other's broadcasts and metadata. Never ship the mock in the production build.
3. **Final manual pass → checklist for Jason** in real Owlbear (two browsers: normal +
   incognito, one GM, one player). Generate this checklist from whatever automated tests
   couldn't cover.

## Test character

Build it **through the character creator**, not by hand-editing data, so the creator is
tested too. Suggested: Hedge Knight, Level 1, STR 13; Knight's Longsword (Signature Weapon),
Gambeson + Shield, Waterskin, 2× Trail Rations; Armor R1 as the Career Pick; Steadfast and
Protect as Talents. Add a second, Scout-based character for ranged/ammo paths.

## Combat scenario (run in order, as both GM and Player)

1. GM starts combat → player sheet switches to the combat layout automatically; per-combat
   trackers reset.
2. Player attacks with the Longsword (Healthy, then Damaged → die steps down, then Broken →
   no damage).
3. Player uses a Gambit → Technique checkbox ticks; capacity respected.
4. Player takes damage below Armor, then damage that empties HP and overflows into STR →
   Critical Save rolls → on failure, a Severe Injury is created with a d10 location.
5. Player Deflects → armor Condition step; test Standard, Shoddy (→ Destroyed), Masterwork
   (Reserve absorbs first).
6. Player takes Strain-costing actions (Brace, Steadfast reroll) → Strain rises, slots fill,
   Overburdened triggers exactly when filled slots **exceed** STR → further damage goes to STR.
7. Apply Rattled, Entangled, Stunned → the right Reactions/actions disable or become Impaired.
8. Morale Save with Steadfast reroll (costs Strain).
9. Scout: ranged attack → ammo Usage Die prompt; depletion behavior.
10. GM ends combat → per-combat resets happen; **Strain does not clear**.
11. Catch Your Breath with Water (HP restored, Strain cleared, Water rolled) and without
    (Deprived, nothing restored).
12. Rest at each quality → only Normal/Comfortable clear Fatigue.
13. New Session → once-per-session abilities reset; Maintained/Veteran/Self-Made behave.
14. Level up → HP Growth and Attribute Growth rolls; Technique capacity updates.
15. Reload the page mid-scenario and load an **older save** → state persists, no crash.
16. GM views the player's sheet → updates live, stays read-only.

## QoL checks (fail the test if any miss)

- **Click budget:** record clicks for every common action. Target ≤ 2 and no page change
  during combat. Report a table: action, clicks, pass/fail.
- Every automated result posts to roll history and has an **Undo**.
- The sheet only stops to ask when there's a real choice (Deflect or not, which Stress option).
- No layout overflow or horizontal scroll at the manifest's popover size.
- Tooltips present on every rules-bearing element.
- `svelte-check` and `vite build` clean.

## Deliverable

A short report with: test results, the click-budget table, bugs found and fixed, and a list
of **rules ambiguities for Jason** (never resolve these by guessing), plus the manual
Owlbear checklist.
