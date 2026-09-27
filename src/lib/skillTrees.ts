// Skill Tree structure follows a universal shape (§5.1-5.3): every tree has
// 4 Rank gates, each Rank 1-3 has 2 Branches, Rank 4 has 3 Masteries. Costs
// are fixed and identical across every tree:
//   R1 via Career Pick: free | R1 otherwise: 1,000 XP
//   R2/R3/R4 gate: 2,000 XP each
//   Any Branch (R1-R3) or Mastery (R4): 1,000 XP each
//
// Node NAMES below are pulled from the manuscript where confirmed - 5 of
// the 11 trees (Armor, Riding, Detection, Burglary, Thievery) are fully
// named. The rest are genuinely incomplete in what's been extracted so
// far: named nodes are real, blank ones ("") are left for you to fill in
// from the book rather than guessed at.

export type SkillNodeTier = "rank" | "branch" | "mastery";
export type SkillNodeId = "R1" | "R1A" | "R1B" | "R2" | "R2A" | "R2B" | "R3" | "R3A" | "R3B" | "R4" | "R4A" | "R4B" | "R4C";

export const NODE_TIER: Record<SkillNodeId, SkillNodeTier> = {
  R1: "rank", R2: "rank", R3: "rank", R4: "rank",
  R1A: "branch", R1B: "branch", R2A: "branch", R2B: "branch", R3A: "branch", R3B: "branch",
  R4A: "mastery", R4B: "mastery", R4C: "mastery",
};

export const NODE_XP_COST: Record<SkillNodeId, number> = {
  R1: 1000, R2: 2000, R3: 2000, R4: 2000,
  R1A: 1000, R1B: 1000, R2A: 1000, R2B: 1000, R3A: 1000, R3B: 1000,
  R4A: 1000, R4B: 1000, R4C: 1000,
};

export const NODE_ORDER: SkillNodeId[] = [
  "R1", "R1A", "R1B", "R2", "R2A", "R2B", "R3", "R3A", "R3B", "R4", "R4A", "R4B", "R4C",
];

// Rank gate prerequisites (§7.7): "To purchase a higher Rank gate, you must
// possess all required lower Rank gates and at least one Branch from each
// preceding Rank." A Branch requires its own Rank gate; a Mastery requires
// R4. Warned about, not enforced - matches the sheet's "bookkeeping tool"
// philosophy everywhere else (zone caps, Overburdened, etc.).
export function nodePrerequisiteMet(ownedNodes: SkillNodeId[], node: SkillNodeId): boolean {
  const tier = NODE_TIER[node];
  if (tier === "branch") {
    const rank = node.slice(0, 2) as SkillNodeId; // "R1A" -> "R1"
    return ownedNodes.includes(rank);
  }
  if (tier === "mastery") {
    return ownedNodes.includes("R4");
  }
  if (node === "R1") return true;
  const rankNum = parseInt(node[1], 10);
  for (let r = 1; r < rankNum; r++) {
    const gate = `R${r}` as SkillNodeId;
    const branchA = `R${r}A` as SkillNodeId;
    const branchB = `R${r}B` as SkillNodeId;
    if (!ownedNodes.includes(gate)) return false;
    if (!ownedNodes.includes(branchA) && !ownedNodes.includes(branchB)) return false;
  }
  return true;
}

export type SkillTreeName =
  | "Blacksmithing" | "Armor" | "Bashing" | "Riding" | "Command"
  | "Detection" | "Burglary" | "Thievery" | "Tracking" | "Ambush" | "Wilderness Craft";

export const SKILL_TREE_NAMES: SkillTreeName[] = [
  "Blacksmithing", "Armor", "Bashing", "Riding", "Command",
  "Detection", "Burglary", "Thievery", "Tracking", "Ambush", "Wilderness Craft",
];

// Which Careers grant access to each tree (§5.8 / §4.13).
export const TREE_CAREER_ACCESS: Record<SkillTreeName, string[]> = {
  Blacksmithing: ["Blacksmith"],
  Armor: ["Blacksmith", "Hedge Knight"],
  Bashing: ["Blacksmith"],
  Riding: ["Hedge Knight"],
  Command: ["Hedge Knight"],
  Detection: ["Thief"],
  Burglary: ["Thief"],
  Thievery: ["Thief"],
  Tracking: ["Scout"],
  Ambush: ["Scout"],
  "Wilderness Craft": ["Scout"],
};

const empty = (): Record<SkillNodeId, string> => ({
  R1: "", R1A: "", R1B: "", R2: "", R2A: "", R2B: "", R3: "", R3A: "", R3B: "", R4: "", R4A: "", R4B: "", R4C: "",
});

export const SKILL_TREE_NODE_NAMES: Record<SkillTreeName, Record<SkillNodeId, string>> = {
  Blacksmithing: {
    ...empty(),
    R1: "Working Knowledge",
    R1A: "Fast Hands",
    R1B: "Salvage Sense",
    R2: "Eye for Weakness",
    R4A: "Master Armorer",
    R4B: "Specialist",
    R4C: "Runic Inlay",
  },
  Armor: {
    ...empty(),
    R1: "Conditioned",
    R1A: "Sure Footed",
    R1B: "Shield Trained",
    R2: "Hardened",
    R2A: "Armor Expert",
    R2B: "Shield Wall",
    R3: "Iron Discipline",
    R3A: "Brace",
    R3B: "Guardian's Instinct",
    R4: "Fortress",
  },
  Bashing: {
    R1: "Blunt Trauma",
    R1A: "Knock Back",
    R1B: "Bell Ringer",
    R2: "Bone Breaker",
    R2A: "Follow Through",
    R2B: "Concussive",
    R3: "Sunder",
    R3A: "Wreck",
    R3B: "Strip Defense",
    R4: "Overwhelming Force",
    R4A: "Unstoppable",
    R4B: "Shockwave",
    R4C: "Execution",
  },
  Riding: {
    R1: "Horseman",
    R1A: "Sure Seat",
    R1B: "Beast Handler",
    R2: "Cavalier",
    R2A: "Devastating Charge",
    R2B: "Ride Them Down",
    R3: "Master Rider",
    R3A: "War Mount",
    R3B: "Saddle Veteran",
    R4: "Knight of the Open Road",
    R4A: "Unbreakable Bond",
    R4B: "Legendary Charge",
    R4C: "Master of Horse",
  },
  Command: {
    R1: "Field Leader",
    R1A: "Rally",
    R1B: "Massed Assault",
    R2: "Battle Captain",
    R2A: "Hold the Line",
    R2B: "Directed Gambit",
    R3: "Veteran Commander",
    R3A: "Counter Command",
    R3B: "No One Left Behind",
    R4: "Warlord",
    R4A: "Perfect Coordination",
    R4B: "Press the Advantage",
    R4C: "Legendary Commander",
  },
  Detection: {
    R1: "Trained Search",
    R1A: "Something Is Wrong",
    R1B: "Read the Scene",
    R2: "Trace the Mechanism",
    R2A: "Layered Security",
    R2B: "Weak Point",
    R3: "Master Survey",
    R3A: "Cautious Advance",
    R3B: "Exploit the Route",
    R4: "Perfect Read",
    R4A: "Untouchable Survey",
    R4B: "Safe Passage",
    R4C: "Ghost Route",
  },
  Burglary: {
    R1: "Defeat the Lock",
    R1A: "Disarm the Trigger",
    R1B: "Leave No Sign",
    R2: "Work Without a Kit",
    R2A: "Quick Work",
    R2B: "Jam the Works",
    R3: "Defeat Complex Security",
    R3A: "Rewire the System",
    R3B: "Controlled Failure",
    R4: "Master Override",
    R4A: "Skeleton Key",
    R4B: "Seize the System",
    R4C: "Vanish the Breach",
  },
  Thievery: {
    R1: "Light Fingers",
    R1A: "Hidden in Plain Sight",
    R1B: "Clean Lift",
    R2: "Slip Through",
    R2A: "Create an Opening",
    R2B: "Lose the Tail",
    R3: "Ghost Step",
    R3A: "Lead Them Through",
    R3B: "Gone Before They React",
    R4: "Perfect Timing",
    R4A: "Empty Their Pockets",
    R4B: "Walk Through the Watch",
    R4C: "Now You See Me",
  },
  Tracking: {
    R1: "Trail Reader",
    R1A: "Read the Quarry",
    R1B: "Cover Your Tracks",
    R2: "Pursuit",
    R2A: "Cut Them Off",
    R2B: "False Passage",
    R3: "Trail Expert",
    R3A: "Closing the Net",
    R3B: "Ghost Company",
    R4: "Huntmaster",
    R4A: "Unerring Hunter",
    R4B: "Grand Interception",
    R4C: "Vanishing Trail",
  },
  Ambush: {
    R1: "Prepared Position",
    R1A: "Camouflage",
    R1B: "Planned Escape",
    R2: "Spring the Trap",
    R2A: "Kill Zone",
    R2B: "Cut the Retreat",
    R3: "Master the Ground",
    R3A: "Coordinated Strike",
    R3B: "Fade Without Trace",
    R4: "Perfect Ambush",
    R4A: "Deadly Surprise",
    R4B: "No Escape",
    R4C: "Ghost Assault",
  },
  "Wilderness Craft": {
    R1: "Fieldcraft",
    R1A: "Read the Route",
    R1B: "Campkeeper",
    R2: "Expedition Sense",
    R2A: "Seasoned Forager",
    R2B: "Weatherwise",
    R3: "Harsh Country",
    R3A: "Forced Passage",
    R3B: "Refuge in the Wild",
    R4: "Master of the Wild",
    R4A: "Relentless Expedition",
    R4B: "Sanctuary",
    R4C: "Living off the Land",
  },
};

// Full mechanical text, condensed for space, straight from the manuscript.
// Only populated where actually confirmed - "" means it hasn't been pulled
// from the book yet (shown as "(full text not captured yet - see book)"
// wherever it's displayed), never a guess.
export const SKILL_TREE_NODE_DESC: Record<SkillTreeName, Record<SkillNodeId, string>> = {
  Blacksmithing: {
    R1: "Field-repair metal weapons/shields/armor/tools without proper tools given time and scrap - 10 min restores a Damaged item to Healthy (once/session per item, no forge needed). Identify metal quality/origin/value by examination.",
    R1A: "Repair two items in the time it takes to repair one; field-repairing under danger/time pressure takes half as long.",
    R1B: "Field-repairing also recovers a spare repair component, usable once this session in place of scrap when field-repairing away from a forge.",
    R2: "Once/combat, after observing an enemy 1 round, identify a structural flaw in its metal armor/shield/weapon. Next attack vs that target: ignore 1 Armor, or force a Condition check on its weapon or shield (d6, 1 = 1 step). Still deals normal damage - a setup, not a sacrifice like Sunder.",
    R2A: "Eye for Weakness's chosen benefit applies for the rest of combat against that target.",
    R2B: "Instead of using Eye for Weakness's benefit yourself, warn an ally - their next Parry against that weapon is Enhanced.",
    R3: "Given a forge, materials, and a full day, craft any Standard metal weapon/shield/armor/tool. Repair Broken metal items without a forge given campfire, tools, scrap, uninterrupted time.",
    R3A: "Weapons you forge may gain one permanent free tag: Brutal, Breaching, or Rugged (must fit the weapon's form).",
    R3B: "Crafting time is halved (a day becomes half a day, a week becomes three days).",
    R4: "Your work doesn't degrade from ordinary wear and carries your maker's mark. Standard metal items you craft begin as Masterwork if materials allow. Reputation grants access to serious patrons/workshops/suppliers.",
    R4A: "Forge A5 armor if you also have Armor R4 and legendary materials (GM-approved). A5 is only available via this; no other mundane source exceeds A4. Takes two degradation hits before stepping to Damaged.",
    R4B: "Forge Specialist weapons from legendary materials; no two identical, each designed around a wielder/style/purpose. May carry one unique GM-approved physical property - not magical unless bound via a Runic Inlay + Enchanting R4.",
    R4C: "During a full Town Turn, prepare one Masterwork/Specialist item for permanent magic using legendary materials. Alone has no effect - a character with Enchanting R4 must bind the enchantment. If the item is Broken/Destroyed the enchantment goes dormant.",
  },
  Armor: {
    R1: "Armor doesn't contribute to Fatigue from marching/climbing/swimming, and no extra travel/rest penalty beyond what a specific piece states. Plates keep their normal Rigid/Stiff/Bulky/donning/Dodge/sleeping restrictions.",
    R1A: "Difficult terrain doesn't slow you while armored. You don't fall Prone from ordinary environmental hazards while armored unless the hazard could overwhelm your footing.",
    R1B: "Shields occupy one hand but don't count as an Inventory Slot. Don/remove a shield without spending your Action.",
    R2: "Armor loses the Bulky tag for your own inventory capacity. Once/round, when an enemy fails to harm you with a melee attack, make a free Shield Bash (d4 Bludgeoning; STR Save or knocked back). Requires a shield.",
    R2A: "Personally fitted armor grants +1 Armor while Healthy (fitting needs a full Rest; lost if the armor becomes Damaged). Can help reach A4, never beyond.",
    R2B: "When you and an adjacent ally both carry shields, you both gain +1 Armor while adjacent and in formation (A4 ceiling).",
    R3: "Share one Armor Wear box across all worn armor. When Deflecting and it would take a Condition step: resolve Masterwork Reserve first; if that doesn't absorb it and Armor Wear is unmarked, mark it and cancel the step; if already marked, clear it and take the step. Clears at session end.",
    R3A: "At the start of your turn, before moving, take 1 Strain to hold position (still act, can't move) - reduce all damage taken by 2 until your next turn. Doesn't stack with Fortress.",
    R3B: "Once/round, take a hit meant for an adjacent ally instead of them (your Armor applies). Costs 1 Strain.",
    R4: "At the start of your turn, before moving, take 1 Strain to become a Fortress until your next turn (still act, can't move): reduce incoming damage by 2, adjacent allies get +1 Armor (A4 ceiling), enemies moving past you must Save or stop. Can't while Prone/Entangled/Stunned. Doesn't stack with Brace.",
    R4A: "While a Fortress, can't be moved/knocked back/Prone by mundane means; magical forced movement requires you to fail a STR Save first.",
    R4B: "Once/combat, take a hit meant for an adjacent ally instead (full damage, Armor applies normally).",
    R4C: "Armor Expert's bonus persists while your fitted armor is Damaged - full protection until Broken. Can't raise total Armor beyond A4.",
  },
  Bashing: {
    R1: "When a bashing weapon attack deals 6+ damage, target is Rattled until its next turn (loses reaction, next action Impaired).",
    R1A: "When you Rattle a target, push it back one step; colliding with a wall/obstacle/creature deals +d4 damage.",
    R1B: "Once/combat, when Blunt Trauma Rattles a target, make it Stunned instead.",
    R2: "Once/combat, when a bashing attack reduces a target to 0 HP, its Critical Save is at Disadvantage; on a fail, the injury is always to a limb (your choice).",
    R2A: "When you reduce a target to 0 HP with a bashing weapon, immediately attack an adjacent enemy without using your Action. Once/round.",
    R2B: "When a target fails a Critical Save from your bashing weapon, it's also Dazed - INT/WIL Saves at Disadvantage until it Rests.",
    R3: "Once/combat, when attacking with a bashing weapon, target a piece of equipment instead of the creature - roll damage normally; weapon takes 1 Condition step on a d6 result of 1, armor/shields take 1 Condition step, other objects use normal breakage. If your damage roll is 6+, severity increases one step.",
    R3A: "When Sunder inflicts a Condition step, add 1 additional step (resolve Masterwork Reserve normally first). No effect on tools/carried objects.",
    R3B: "When you degrade an enemy's armor through Sunder, it loses 1 Armor for the rest of the combat.",
    R4: "Once/combat, before rolling damage with a bashing weapon, declare an Overwhelming Strike: deals maximum weapon damage instead of the rolled result, target makes a STR Save or falls Prone (Elite at Disadvantage; Boss immune to the Prone effect unless the fiction allows it).",
    R4A: "Your Overwhelming Strike ignores Armor entirely.",
    R4B: "Your Overwhelming Strike affects all enemies within reach - resolve damage and the STR Save separately for each.",
    R4C: "When the target is already Prone, Overwhelming Strike deals double damage. If also Stunned, the attack automatically causes a Critical Save.",
  },
  Riding: {
    R1: "Fight effectively mounted: mount obeys simple commands free; mount/dismount once/turn free; difficult terrain doesn't Impair mounted movement unless it'd stop the mount; Charging mounted in open ground Enhances your first melee attack's damage roll vs an unmounted target.",
    R1A: "Can't be involuntarily dismounted unless you fail a DEX Save. If your mount falls beneath you, DEX Save to land on your feet instead of Prone/Entangled.",
    R1B: "Calm a frightened/injured/panicked mount without a Save given a moment. Mounted travel ignores ordinary Fatigue from long hours in the saddle.",
    R2: "Perform Gambits normally while mounted. Split your mount's movement before/after your Action on your turn.",
    R2A: "Charging mounted increases your weapon's damage die one step (d6->d8, d8->d10); a Slow (d10) weapon deals +2 instead.",
    R2B: "After forcing an enemy to retreat or fall Prone while mounted, continue moving without ending your movement.",
    R3: "Once/round, your mount may reposition a short distance without using your normal movement.",
    R3A: "Mount ignores ordinary fear from combat/monsters/loud events; only supernatural fear or genuinely overwhelming circumstances shake it.",
    R3B: "When your mount would hit 0 HP, leap clear immediately - no fall damage, land standing adjacent. Once/combat.",
    R4: "Once/round, after your Action while mounted, your mount may immediately move a short distance - doesn't count against your movement.",
    R4A: "Mount gains Veteran status. Once/session, when your mount would be Slain, leave it at 1 HP/1 STR instead.",
    R4B: "Once/combat, declare a Legendary Charge: weapon's damage die increases one step (Slow d10 deals +2 instead), target can't Block or Dodge, and you may immediately perform one fiction-supported Gambit.",
    R4C: "Mount understands your intent wordlessly - once/round it may act without your Action (GM's judgment). During a Town Turn, train it for complex battlefield maneuvers.",
  },
  Command: {
    R1: "As an Action, order one ally who can hear/see you - they may immediately move a short distance, stand from Prone, or draw/ready one item, without spending their own Action.",
    R1A: "Field Leader's chosen ally may instead remove Rattled. Once/combat, may also remove an ordinary fear/morale effect.",
    R1B: "Gang Up may include up to four supporting allies instead of three (doesn't increase Gang Up's bonus damage; Coordinated Assault stays capped at +3).",
    R2: "As an Action, issue coordinated orders to up to two allies who can hear/see you - each may immediately move a short distance (no Action spent), possibly into Gang Up position.",
    R2A: "When an adjacent ally would be pushed/pulled/knocked Prone/forcibly moved, you may move into an adjacent space to support them and, if the fiction allows, prevent that forced movement.",
    R2B: "When the initiator declares the single Gambit allowed during a Gang Up you initiated, that Gambit's weapon damage roll is Enhanced.",
    R3: "As an Action, issue a decisive order to up to three allies who can hear/see you - each may immediately move a short distance, stand from Prone, or remove Rattled (no Action spent).",
    R3A: "When another commander tries to rally/direct/intimidate/control allies who can hear/see you, oppose it with an opposed WIL Save - win and the enemy command fails against those allies.",
    R3B: "When an ally within a short distance becomes Mortally Wounded, move adjacent to them free of movement cost; until the end of your next turn, carry/drag them without becoming Impaired.",
    R4: "Once/combat, without using your Action, declare a Battle Plan at the start of a round: until your next turn, allies who can hear/see you may freely swap places while moving, and Gang Ups you initiate may include any number of allies (bonus damage still capped at +3 with Coordinated Assault; only the initiator declares the Gambit).",
    R4A: "Once/combat, immediately after an ally completes their Action, choose another ally who can hear/see you - they may immediately perform a Gambit against a valid target without using their Action (separate from any Gang Up already resolved).",
    R4B: "Once/combat, after a Gang Up you initiated resolves, choose one participating ally who hasn't acted this round - they may immediately move a short distance for free (no extra Action).",
    R4C: "Friendly creatures who recognize your authority naturally look to you for direction. During a Town Turn, drill a willing group of followers/hirelings/militia/soldiers - until training lapses, the GM treats them as disciplined rather than untrained for morale/formation/coordination.",
  },
  Detection: {
    R1: "Systematically search a clearly defined feature/subject/portion of the Site Area (1 Exploration Turn, needs light+access). Routine physical features found without a Save; uncertain/pressured searches need an INT Save.",
    R1A: "Near an ordinary trap/alarm/concealed hazard, the GM tells you something's suspicious when signs are present - not the exact location/trigger/bypass.",
    R1B: "After a Trained Search, ask one question about physical activity in the area (what moved, who entered/left, busiest route, watch spots, what's out of place) - answered from available evidence.",
    R2: "After Trained Search, determine how an ordinary trap/alarm/entrance/mechanism works - trigger, effect, components, state, connections. Unusual/complex systems may need an INT Save.",
    R2A: "Identify linked traps, backups, decoys, secondary triggers, resets, delays, and connected alarms in the same system.",
    R2B: "Identify the safest/weakest point to test, approach, or manipulate the mechanism from.",
    R3: "Survey the entire current Site Area in one Exploration Turn - identify all ordinary detectable traps/alarms/concealed access/features. Apply Trace the Mechanism to one found feature free.",
    R3A: "Moving at half exploration speed, continuously inspect the next 10ft of route for ordinary traps/alarms.",
    R3B: "After examining a hidden way, choose one benefit the Company gets on first use: Advantage bypassing security, Advantage escaping pursuit, Advantage surprising creatures, or pursuers must locate the route first.",
    R4: "After Master Survey, apply Trace the Mechanism to every discovered trap/alarm/entrance/security feature in the area.",
    R4A: "Master Survey reveals every physically detectable mundane trap/alarm/hidden compartment/entrance/feature, including extraordinary mundane concealment.",
    R4B: "After Perfect Read, learn the safest way through without triggering security - Company gets Advantage following that route or bypassing the system.",
    R4C: "Exploit the Route: choose two benefits instead of one, the whole Company benefits, and ordinary pursuers can't follow without first finding the route.",
  },
  Burglary: {
    R1: "With burglary tools, open ordinary mechanical locks/containers/barred closures. Routine mechanisms need no Save given time+access; damaged/unfamiliar/secure/trapped/alarmed/pressured attempts need a DEX Save.",
    R1A: "After identifying a physical trap/alarm/trigger, disable or bypass it with appropriate tools.",
    R1B: "After opening/bypassing an ordinary security feature, relock/replace/restore it so the interference isn't obvious.",
    R2: "Attempt ordinary lock/trap/alarm/closure work with improvised tools - always requires a DEX Save even if normally routine.",
    R2A: "Attempt a task that normally takes one Exploration Turn in one Action/combat round when practical - always a DEX Save.",
    R2B: "Temporarily disable an ordinary physical mechanism until the obstruction is found/removed/repaired/overcome.",
    R3: "Open/disable/bypass complex linked/concealed/sequenced physical security with proper tools+access+1 Exploration Turn - DEX Save.",
    R3A: "After defeating a complex system, alter its function within its existing construction.",
    R3B: "On a failed burglary attempt, stop before the full consequence when the fiction allows - task stays unresolved, GM applies a lesser consequence.",
    R4: "Working a connected complex security system you understand, affect the whole system at once: open every connected closure, disable every trap/alarm, create one safe route, or set one existing state.",
    R4A: "Defeat any nonmagical lock/restraint/closure/seal that can be opened at all, even from the wrong side - only true physical impossibility stops you.",
    R4B: "After Master Override, control the connected system for the scene (or until repaired) within its own limits.",
    R4C: "Restore a defeated system so completely even expert inspection can't reveal interference; may leave false evidence.",
  },
  Thievery: {
    R1: "Covertly take/plant/exchange/pass/conceal a small carried object - DEX Save if the target is distracted/unaware/vulnerable. Also frees you from ordinary personal restraints given time; in danger or as one Action, DEX Save. Defeating the restraint mechanism itself is Burglary.",
    R1A: "Conceal a small object on your body so an ordinary search won't find it; a careful/invasive search may still need a DEX Save.",
    R1B: "After a successful Light Fingers, the target doesn't immediately know what happened - no obvious proof points to you without direct evidence.",
    R2: "Move through a watched/occupied/controlled space using timing, cover, crowds, shadows, noise, distraction - DEX Save when the route is plausible and you're not under continuous direct observation.",
    R2A: "Use a plausible environmental trick or brief distraction to create the opening Slip Through needs.",
    R2B: "After breaking line of sight, immediately Slip Through into a plausible nearby route/hiding place - pursuers must search or predict your route.",
    R3: "Gain Advantage on Slip Through when at least one meaningful environmental opening exists (cover, darkness, crowding, noise, distraction, alternate route, clutter).",
    R3A: "On a successful Slip Through, guide one nearby willing ally along the same route.",
    R3B: "On a successful Slip Through, observers don't immediately know where you went - reposition to one plausible nearby spot.",
    R4: "Combine Slip Through and Light Fingers into one DEX Save covering both the covert movement and the theft/plant/exchange/conceal/handoff.",
    R4A: "On a successful Light Fingers, affect every small reachable object on the target.",
    R4B: "Direct observation no longer automatically prevents Slip Through, given even a brief plausible opening.",
    R4C: "After a successful Perfect Timing, vanish from the observers' known position, leave a false trail, or reach a nearby exit/hiding place.",
  },
  Tracking: {
    R1: "Follow a clear trail through ordinary terrain and determine quarry type, approximate number, direction, and how recently it was made. No Save with adequate time/light/intact evidence; INT Save if faint/concealed/deteriorating/overlapping/pressured.",
    R1A: "When examining a trail, determine two more facts: walking/running/riding/dragging/carrying; injured/exhausted/burdened; group gained/lost members; cautious/hurried/concealing; whether it stopped and for how long.",
    R1B: "Traveling at half pace, conceal your and one ally's passage - ordinary observers find no trail. A tracker needs an INT Save to recover it.",
    R2: "Once a trail is established, follow it through difficult/interrupted terrain at normal pace, usually without a Save. While pursuing you always know whether you're gaining/losing/maintaining distance and whether the quarry changed pace/stopped/split/doubled back. Save only vs. trained opposition, disappearing evidence, or similar complications.",
    R2A: "Identify the quarry's most likely route/destination and a plausible alternate - committing to the right route gains 1 travel interval.",
    R2B: "Create a false trail for the whole Company (half pace, or normal pace if everyone cooperates). A tracker needs an INT Save to see through it.",
    R3: "Recognize a familiar quarry's trail distinctly, distinguish travelers, spot planted evidence, and reconstruct site events. Once per travel interval, ask the GM one evidence-supported question (is the quarry aware of pursuit, what they need, where they'll stop, is evidence genuine).",
    R3A: "Identify a constraint point the quarry will likely cross; reaching it first lets you choose two Ambush-style preparations (favorable ground, conceal the Company, block a route, etc.).",
    R3B: "Conceal the physical trail of the whole willing Company at normal pace - a tracker needs an INT Save at Disadvantage to see through it.",
    R4: "Declare an active Hunt on a positively established quarry: ordinary failures can't end the pursuit, you always know if you're gaining/losing ground, and mundane false signs can't mislead you. Once per travel interval, choose one: press the pace, bypass a route hazard, deny a deception, or find an intercept route.",
    R4A: "Mundane attempts to break the trail are always recovered after one search interval, no Save required; you recognize when a supernatural effect broke it.",
    R4B: "At an interception point, choose three preparations from Closing the Net instead of two, and may reposition one after seeing the quarry's approach.",
    R4C: "Conceal an entire traveling company (mounts, hirelings, casualties included) at normal pace. R1-R3 trackers Save with Disadvantage to see through it; an R4 tracker opposes normally.",
  },
  Ambush: {
    R1: "Given advance warning of an approaching group, quickly prepare a concealed position for yourself and one willing ally - you begin the encounter concealed and can't be targeted until detected. No Save with adequate time/terrain/warning; DEX Save if rushed or the enemy is already alert.",
    R1A: "Prepare concealed positions for yourself and up to three willing allies. An actively searching creature needs an INT Save to detect signs and locate one participant (others stay concealed).",
    R1B: "Designate a withdrawal route when preparing; after the opening attack/Gambit, you and the prepared ally may reposition along it for free.",
    R2: "When springing a valid Prepared Position, choose the exact trigger. Until then participants stay concealed; each prepared participant's first attack/Gambit while still concealed is Enhanced, then they're revealed.",
    R2A: "Define a bounded Kill Zone - the first two attacks/Gambits by prepared participants against targets inside it are Enhanced.",
    R2B: "Choose one route out of the prepared area; the first enemy trying to use it must stop, force through (Action + Save), or its movement ends short.",
    R3: "Include the entire willing Company in a Prepared Position and choose two preparations (Crossfire, Split the Group, Hidden Reserve, Sealed Escape, Isolate the Quarry, Hold the Trigger). Doesn't grant Surprise or an initiative change by itself.",
    R3A: "Choose one additional Master the Ground preparation; the first two participants attacking the same target count as positioned for Gang Up even if not adjacent.",
    R3B: "Before anyone reveals themselves, abandon the ambush and withdraw - if undetected, no combat begins and the Company leaves clean; if partially detected, you still get a head start on pursuit.",
    R4: "Choose three Master the Ground preparations instead of two, may swap one after seeing the enemy's approach, reposition a participant, and set a fallback trigger. A suspicious enemy gets one INT Save to find partial evidence.",
    R4A: "When you spring the ambush, all enemies that failed to detect it are automatically Surprised, and each prepared participant's first attack/Gambit against a Surprised enemy is Enhanced.",
    R4B: "Choose up to three routes out of the prepared area that enemies can't freely use for the first round (Action + Save to force through, and they can't move further that turn on success).",
    R4C: "Each prepared participant may, once, immediately reposition to another prepared location after their first attack/Gambit - no Action cost, doesn't reveal anyone else.",
  },
  "Wilderness Craft": {
    R1: "Your Rank adds its bonus to Trailblaze and Make Camp. Trailblaze ordinary wilderness, recognize weather/terrain hazards, locate a campsite/resources, lead Make Camp in normal conditions.",
    R1A: "Before committing to the next travel quarter, learn whether the route is ordinary/difficult/hazardous, what it requires, whether it risks a forced-march quarter, and one obvious risk - before rolling.",
    R1B: "When leading Make Camp successfully, choose one bonus: weather can't interfere with Rest, camp is concealed, a hazard is identified, mounts are secured, or fire/water/sleeping arrangements are safe.",
    R2: "As Trailblazer, the GM must warn you before the roll about a likely Travel Bane, Lost trigger, Difficult/Severe terrain or weather, special requirements, or an inability to finish the quarter - then you may continue, reroute, stop, or state a precaution that reduces the first related consequence.",
    R2A: "Forage with Advantage; on success also learn if the food/water is safe, spoiled, or the area is becoming depleted.",
    R2B: "Before the day's Weather roll, read the signs and get the GM's forecast plus one precaution; following it grants one benefit (ignore weather Fatigue, prevent spoilage, keep fire/shelter working, etc.).",
    R3: "Lead Trailblaze/Make Camp through conditions that would normally make the task Unavailable, instead making it possible at Disadvantage if a route/campsite genuinely exists. Once/Travel Turn, accept a stated cost to prevent a terrain/weather/exposure failure from getting worse.",
    R3A: "After a failed Trailblaze from terrain/weather, force the passage anyway - choose two costs (supplies, Fatigue, a stalled mount, damaged equipment, etc.).",
    R3B: "Leading Make Camp in harsh terrain/weather: on success choose two Campkeeper benefits and prevent one traveler's exposure Fatigue; on failure, accept one cost and still get the camp.",
    R4: "Sustain the expedition through extreme natural conditions - mundane terrain/weather can't make Trailblaze/Make Camp impossible if a route/campsite exists. Once/Travel Turn, declare a failed roll succeeds anyway for one cost. Ignore the first point of Fatigue from ordinary terrain/weather/exposure each Travel Turn.",
    R4A: "Once/day, when entering a forced-march quarter, choose one: everyone Saves normally instead of at Disadvantage, one traveler auto-succeeds, one mount ignores the penalty, or a failed Save causes no Fatigue.",
    R4B: "Lead Make Camp into a full sanctuary even in extreme conditions: weather can't interrupt Rest, camp is concealed, no exposure Fatigue, plus one more bonus of your choice (extra Fatigue removal, repaired item, half water use, etc.).",
    R4C: "Once/day after a successful Forage/Hunt/Fish, choose one: feed up to six people with no ration roll, feed people+mounts without consuming stock, gain 1 extra d6 Fresh Ration, or carried Rations/Water only deplete on a natural 1 for the day.",
  },
};
