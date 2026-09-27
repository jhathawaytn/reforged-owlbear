// All 30 Talents in this playtest build (§6.9 - "Playtest 1: 30 of ~73
// Talents"), with real effect text from Chapter 6. Keyed by name since
// Talent names are unique across categories.

export const TALENT_DESC: Record<string, string> = {
  // Combat
  Alert:
    "Your presence is a favorable circumstance when the GM determines Awareness before combat. If you'd be Surprised, you may make an Initiative Save anyway - success grants an Initiative Action despite being Surprised.",
  "Brutal Blows":
    "When you deal 10+ damage in a single attack, the target's next damaging Action has an Impaired damage roll.",
  "Covering Fire":
    "You can fire ranged weapons into melee without restriction (otherwise not possible). On a damage roll of 1, the shot strikes an ally engaged with the target instead.",
  "Crippling Shot":
    "On a ranged attack where your damage roll exceeds half the die's maximum (4+ on d6, 5+ on d8, etc.), the target's next damaging Action is Impaired and they can't move on their next turn.",
  "Firm Grip": "You cannot be disarmed while conscious - any Gambit that would make you drop a held item automatically fails against you.",
  Intimidate:
    "As an Action, target one creature that can see/hear and comprehend you - WIL Save or, until the end of its next turn, it can't willingly advance toward you or take a damaging Action against you.",
  "Mounted Warrior":
    "Fight from a trained, willing mount without Impairment merely for being mounted; mount/dismount on your turn costs no Action. Doesn't grant Riding R1's Enhanced Charge or R3A's War Mount protection.",
  "Patient Strike":
    "You may decline your Initiative Save (no Surprised combatant is eligible anyway) - if declined, your first melee/ranged Action's damage roll during the Clash is Enhanced instead of gaining an Initiative Action.",
  Protect:
    "Choose an adjacent ally at the start of your turn - until your next turn, attacks against them may target you instead if you can intervene. Ends if you move away, can't act, or choose another target. Grants no Armor/damage reduction/free movement/counterattack.",
  "Quick Draw":
    "Name one weapon type when acquired. Draw/ready it before Initiative with no Action cost, and draw/sheath/ready it during your Clash Turn or any Fray Turn without spending an Action.",
  "Snake's Parry": "When Parrying and your damage roll ties your opponent's, you win the Parry instead of tying.",
  Steadfast:
    "Once/combat, when you fail a Morale Save or another fear Save, take 1 Strain to reroll it (keep the second result).",
  Surge:
    "Once/combat, take one additional non-attack Action - move, interact with the environment, retrieve/use an ordinary item, or another primarily supportive/positional activity the GM approves. Can't attack, cast, activate, Gambit, or grant another Action.",
  "Throwing Master":
    "When making a Ranged Action by throwing an individually-tracked Thrown weapon, roll two damage dice and keep the higher. The weapon doesn't break from a low roll.",

  // Exploration
  Acrobat:
    "Near-supernatural balance - narrow ledges, unstable surfaces, and difficult terrain don't slow you or require a Save; you can cross obstacles that would stop anyone else if any physical path exists. (Balance/traversal on an existing route - ascent/descent with no route is Skilled Climber.)",
  "Animal Handler":
    "Approach, calm, restrain, lead, load, and care for ordinary animals; given days of work, teach a willing domesticated animal one simple behavior. Can attempt what's unsafe/impossible for the untrained with frightened/injured/agitated animals (WIL to calm/direct, DEX to restrain/handle). Doesn't make wild animals loyal or override instinct/abuse/supernatural influence.",
  "Field Signals":
    "Establish and teach a compact field-signal system (hand signs, whistles, bird calls, mirror flashes, trail marks) for brief practical info (halt, advance, danger, etc.) within sight/hearing. Can't convey detailed conversation; outsiders can tell communication is happening but not understand it.",
  "Skilled Climber":
    "Scale near-impossible surfaces (smooth stone, sheer cliffs, building exteriors) that would need gear for anyone else. With gear, nothing is beyond you.",
  "Well-Traveled":
    "Know the location and general character of all major settlements in the region, likely minor/obscure landmarks too, and the reputation/dangers/opportunities of roads you've traveled.",

  // Social
  "Animal Attuned":
    "Animals respond positively to you - add +1 to the GM's Reaction Roll for an animal/beast; hostile or frightened animals calm faster around you.",
  Crafty:
    "Repair, jury-rig, and improvise fixes for non-magical objects given materials and time (GM determines what's possible). Can't produce Masterwork equipment, repair magical items, or replace ranked professional crafting.",
  "Friends in High Places":
    "One established contact among the region's nobility/clergy/guild leadership/military/civil authorities - when available, they recognize you, hear a reasonable request, and provide an introduction or minor courtesy. Grants access, not outcomes.",
  Haggler:
    "Buy Standard mundane equipment for 90% of listed price; resell usable mundane equipment for 60% of its Quality-adjusted current value. Doesn't affect Treasure Value or Damaged/Broken/Destroyed items.",
  Inspiring:
    "Once/round, when an ally who can see/hear you fails a Morale Save, take 1 Strain to let them reroll it (keep the second result). A creature can benefit from this only once/combat.",
  "Market Access":
    "Navigate full commerce, legal and otherwise - black markets, restricted goods, unlicensed services, off-the-books deals are accessible in any settlement of meaningful size. Establishes access, not guaranteed stock/price/quantity.",

  // Tricks & Subterfuge
  Opportunist:
    "When chaos/distraction/confusion fills a scene (a brawl, an alarm, a fire), damage rolls against you are Impaired.",
  "Pocket Change":
    "Once/day, work a crowd/market/public space for small coin - WIL Save: success yields 1d10 SP, failure yields 1d4 SP.",
  Stashcraft:
    "Nearly always produce a concealed weapon/small item even when searched. An item you've hidden in a location needs an INT Save from the searcher to find, when discovery is uncertain.",
  Subtle:
    "You don't draw attention - enemies and guards give you low priority and rarely address or target you first.",
  Surveillance:
    "For each full week observing a local power (a noble, guild, criminal org, religious institution), learn one specific actionable dirty secret about them (GM determines what's actually there to find).",
};
