// Career Questionnaires (Ch.4, one per Career - §3.8: "Only your first Career
// includes a Questionnaire"). Each Beat is a d6 table; Beats 1-3 grant a
// named Attribute increase, Beat 4 (Breaking Point) grants no Attribute and
// instead records a narrative hook via the listed follow-up prompt.
//
// `text` is written in first person (the book's own options address the
// player as "you"; these are reworded to "I" so they read as the character's
// own background). `detailPrompt`/`detailTemplate` cover every option that
// asks the player to name or describe something (the book's "(names
// someone/something)" flag on Beats 1-3, and every Beat 4 follow-up bullet).
// `detailPrompt` is the wizard's input label and stays addressed to the
// player ("Name..."); `detailTemplate` turns the typed answer into a
// first-person clause for the Background Summary instead of just tacking it
// on raw.

import type { Attribute } from "./types";
import type { CareerName } from "./careers";

export type QuestionnaireOption = {
  text: string;
  attr?: Attribute; // Beats 1-3 only
  detailPrompt?: string; // the wizard's input label, e.g. "Name the one who protected you."
  detailTemplate?: (answer: string) => string; // e.g. (d) => `${d} was the one who protected me.`
};

export type QuestionnaireBeat = {
  title: string;
  prompt: string;
  options: QuestionnaireOption[]; // exactly 6, d6-indexed
};

export type CareerQuestionnaireData = {
  beat1: QuestionnaireBeat;
  beat2: QuestionnaireBeat;
  beat3: QuestionnaireBeat;
  beat4: QuestionnaireBeat;
};

export const CAREER_QUESTIONNAIRES: Record<CareerName, CareerQuestionnaireData> = {
  Blacksmith: {
    beat1: {
      title: "Formative Influence",
      prompt: "Who or what first shaped you?",
      options: [
        {
          text: "I was orphaned young and taken in by laborers who expected every mouth to earn its bread.",
          attr: "STR",
          detailPrompt: "Name the one who protected you.",
          detailTemplate: (d) => `${d} was the one who protected me.`,
        },
        { text: "My family burned charcoal in the deep woods. I learned that every forge begins with smoke, patience, and ruined trees.", attr: "WIL" },
        { text: "My family worked poor land, and every broken hinge, plow, and horseshoe eventually reached my hands.", attr: "INT" },
        {
          text: "My parents kept a roadside inn. Smiths, soldiers, drovers, and liars passed through my common room.",
          attr: "INT",
          detailPrompt: "Name a traveler who remembers you.",
          detailTemplate: (d) => `${d} was a traveler who remembers me.`,
        },
        {
          text: "One of my parents was the village smith. I worked the bellows before I was trusted with a hammer.",
          attr: "DEX",
          detailPrompt: "Name one lesson they refused to teach.",
          detailTemplate: (d) => `${d} was one lesson they refused to teach me.`,
        },
        { text: "My family scavenged ruined keeps and old battlefields for workable iron. I learned what war leaves behind.", attr: "STR" },
      ],
    },
    beat2: {
      title: "Early Hardship",
      prompt: "What tested you before your working life?",
      options: [
        { text: "I spent a season hauling ore, charcoal, or stone for adults who cared more about the work than my age.", attr: "STR" },
        { text: "A neighbor's plow broke at the worst possible time of year, and I was the one who worked out how to fix it well enough to finish the season.", attr: "INT" },
        { text: "An elder set me a task meant to make me quit. I didn't, even after they stopped watching to see if I would.", attr: "WIL" },
        { text: "I was trusted early to hold hot metal steady for another's hammer, and never once flinched or let it slip.", attr: "DEX" },
        {
          text: "A retired soldier showed me where armor buckles and why weapons fail.",
          attr: "INT",
          detailPrompt: "Name the battle they would not discuss.",
          detailTemplate: (d) => `${d} was the battle they would not discuss.`,
        },
        {
          text: "An injured worker or lonely widow depended on my help. Strength meant service before it meant violence.",
          attr: "WIL",
          detailPrompt: "Name what they still need.",
          detailTemplate: (d) => `${d} is what they still need.`,
        },
      ],
    },
    beat3: {
      title: "Years at the Forge",
      prompt: "What did years at the forge make of you?",
      options: [
        { text: "I completed a formal apprenticeship beneath a guild-recognized master. Every mistake was remembered.", attr: "INT" },
        { text: "I worked in a military forge repairing armor after each campaign. I learned which damage kills later.", attr: "STR" },
        { text: "I served in a frontier smithy where tools were scarce and nothing useful could be wasted.", attr: "WIL" },
        {
          text: "I traveled from forge to forge and never stayed long enough to finish a proper apprenticeship.",
          attr: "DEX",
          detailPrompt: "Name the basic lesson you missed.",
          detailTemplate: (d) => `${d} was the basic lesson I missed.`,
        },
        { text: "A blade I made broke in a real fight. Someone died holding it. Someone helped me recover the pieces before they were examined.", attr: "WIL" },
        { text: "Thieves came for the forge payroll. I met them with a work hammer.", attr: "STR" },
      ],
    },
    beat4: {
      title: "Breaking Point",
      prompt: "Why did that life end?",
      options: [
        {
          text: "My forge burned - accident, sabotage, or punishment. Only one blackened tool survived.",
          detailPrompt: "Carry that Petty tool.",
          detailTemplate: (d) => `I still carry ${d}.`,
        },
        {
          text: "The guild cast me out for exposing fraud, violating a monopoly, or refusing an order.",
          detailPrompt: "Name your guild rival.",
          detailTemplate: (d) => `${d} is my guild rival.`,
        },
        {
          text: "I made the wrong weapon for the wrong person. Its history ruined mine.",
          detailPrompt: "Name who now carries the weapon.",
          detailTemplate: (d) => `${d} now carries the weapon.`,
        },
        {
          text: "I could not save my master, apprentice, spouse, or child. My skill was real and useless when it mattered.",
          detailPrompt: "Carry their unfinished work.",
          detailTemplate: (d) => `I still carry ${d}, their unfinished work.`,
        },
        {
          text: "A lord seized the forge and conscripted everyone in it. I fled rather than keep supplying the campaign.",
          detailPrompt: "Carry a list of those still trapped in service.",
          detailTemplate: (d) => `I still carry ${d}.`,
        },
        {
          text: "I completed something forbidden. It worked exactly as intended, which was worse than failure.",
          detailPrompt: "Tell the GM what it sometimes does.",
          detailTemplate: (d) => `Sometimes, it ${d}.`,
        },
      ],
    },
  },
  "Hedge Knight": {
    beat1: {
      title: "Formative Influence",
      prompt: "Who or what first shaped you?",
      options: [
        { text: "I was born to a landless or ruined knightly family, told from childhood that honor was the only inheritance I'd actually receive.", attr: "WIL" },
        {
          text: "I served as a squire to a knight who taught me more about oaths than about swordplay.",
          attr: "WIL",
          detailPrompt: "Name what they made you swear.",
          detailTemplate: (d) => `They made me swear ${d}.`,
        },
        { text: "I grew up around horses, tournaments, and campgrounds, learning the physical work of knighthood before any of its glory.", attr: "STR" },
        { text: "A knight passing through my home showed me real swordplay, and I never stopped chasing what I saw that day.", attr: "DEX" },
        { text: "My family lost its land or title before I was born, and I grew up hearing about a life I never actually had.", attr: "WIL" },
        { text: "I trained under a hard, exacting master-at-arms who cared more about correct form than my safety.", attr: "DEX" },
      ],
    },
    beat2: {
      title: "Early Hardship",
      prompt: "What tested you before your working life?",
      options: [
        { text: "I bore the weight of armor, weapons, and gear on long marches long before I was strong enough for it to be easy.", attr: "STR" },
        { text: "I was made to keep an oath that cost me something real, and kept it anyway.", attr: "WIL" },
        { text: "I lost a duel, tournament, or contest publicly, and had to find a way to keep riding under people who'd watched me lose.", attr: "WIL" },
        { text: "I learned to control a warhorse in chaos - battle, storm, panic - because a knight who can't control their mount is just a target.", attr: "DEX" },
        { text: "I was sent to fight for a cause I didn't fully believe in, and did my duty anyway.", attr: "STR" },
        { text: "I studied the laws of chivalry and heraldry closely enough to use them as a weapon in an argument, not just a sword fight.", attr: "INT" },
      ],
    },
    beat3: {
      title: "Years on the Road",
      prompt: "What did years on the road make of you?",
      options: [
        { text: "I rode from tournament to tournament, living on prize money and reputation between wins.", attr: "DEX" },
        { text: "I served as a hired sword or escort for merchants, pilgrims, or nobles who couldn't afford a real household guard.", attr: "STR" },
        { text: "I fought in a cause or war under a banner that wasn't my own, because it paid or because it was right.", attr: "WIL" },
        { text: "I spent years enforcing, mediating, or judging disputes by the old codes of chivalry in places law had otherwise abandoned.", attr: "INT" },
        { text: "I trained young squires and hopefuls who could pay little beyond food and shelter.", attr: "WIL" },
        { text: "I survived campaigns, border skirmishes, and duels that killed better-equipped knights than me.", attr: "STR" },
      ],
    },
    beat4: {
      title: "Breaking Point",
      prompt: "Why did that life end?",
      options: [
        {
          text: "The lord or cause I swore to betrayed the oath first.",
          detailPrompt: "Name what they did.",
          detailTemplate: (d) => `They ${d}.`,
        },
        {
          text: "I broke my own oath to save a life, and I've carried the weight of that choice ever since.",
          detailPrompt: "Name who you saved.",
          detailTemplate: (d) => `I saved ${d}.`,
        },
        {
          text: "My knighthood was stripped, disputed, or never fully recognized, and I ride now on reputation alone.",
          detailPrompt: "Name who disputes it.",
          detailTemplate: (d) => `${d} disputes it.`,
        },
        {
          text: "I lost someone - squire, mount, sworn companion - who trusted my judgment completely, and I'm still not sure I deserved that trust.",
          detailPrompt: "Name them.",
          detailTemplate: (d) => `${d} was the one I lost.`,
        },
        {
          text: "I discovered the cause I'd bleed for was never what I was told it was.",
          detailPrompt: "Tell the GM what you learned.",
          detailTemplate: (d) => `I learned ${d}.`,
        },
        {
          text: "I was the last of my household's knights to survive a battle everyone else remembers as a victory.",
          detailPrompt: "Name one who didn't survive.",
          detailTemplate: (d) => `${d} did not survive.`,
        },
      ],
    },
  },
  Thief: {
    beat1: {
      title: "Formative Influence",
      prompt: "Who or what first shaped you?",
      options: [
        { text: "I grew up in close, overcrowded streets where taking what I needed was just how the week worked.", attr: "DEX" },
        {
          text: "Someone in my family was a thief before me, and taught me the trade as naturally as some children learn a farm.",
          attr: "INT",
          detailPrompt: "Name what they warned you never to steal.",
          detailTemplate: (d) => `They warned me never to steal ${d}.`,
        },
        { text: "I was born to means and lost them - through ruin, scandal, or someone else's debt - and learned to take back what the world owed me.", attr: "WIL" },
        { text: "I ran messages, favors, and small goods for people who didn't ask questions, long before I took anything that wasn't offered.", attr: "DEX" },
        { text: "I watched someone I loved get caught and punished for a small theft, and decided I would never be caught the same way.", attr: "WIL" },
        { text: "A locksmith, tinker, or peddler taught me how things were built - which is the same knowledge as how they come apart.", attr: "INT" },
      ],
    },
    beat2: {
      title: "Early Hardship",
      prompt: "What tested you before your working life?",
      options: [
        { text: "I was caught for the first time, and talked, bribed, or charmed my way out of the consequences.", attr: "INT" },
        { text: "I went hungry often enough that hesitation stopped being something I could afford.", attr: "WIL" },
        { text: "I climbed, squeezed, or slipped through spaces built to keep people out, long before anyone taught me how.", attr: "DEX" },
        { text: "I carried more than I should have been able to, farther than should have been possible, because stopping wasn't an option.", attr: "STR" },
        { text: "Someone I trusted turned me in, or nearly did, and I learned exactly how far trust could be pushed.", attr: "WIL" },
        { text: "I studied a mark for weeks before ever taking anything, and learned patience most people never need.", attr: "INT" },
      ],
    },
    beat3: {
      title: "Years Outside the Law",
      prompt: "What did years outside the law make of you?",
      options: [
        { text: "I worked a city's rooftops and alleys until I knew them better than the guards who patrolled them.", attr: "DEX" },
        { text: "I ran with a guild or crew, and did the crew's dirty work when muscle mattered more than finesse.", attr: "STR" },
        { text: "I specialized in confidence work - talking my way into places and trust I had no right to.", attr: "INT" },
        { text: "I worked alone, by necessity or choice, and never fully trusted a partner again.", attr: "WIL" },
        { text: "I cased and cracked places built specifically to be impossible, and got good enough that impossible stopped meaning anything.", attr: "INT" },
        { text: "I smuggled goods, people, or secrets across borders and checkpoints that were supposed to stop exactly that.", attr: "DEX" },
      ],
    },
    beat4: {
      title: "Breaking Point",
      prompt: "Why did that life end?",
      options: [
        {
          text: "A job went wrong and someone died who wasn't supposed to be there.",
          detailPrompt: "Name who.",
          detailTemplate: (d) => `${d} was the one who died.`,
        },
        {
          text: "I stole something that turned out to belong to someone far more dangerous than I realized.",
          detailPrompt: "Name them.",
          detailTemplate: (d) => `${d} turned out to be the one I stole from.`,
        },
        {
          text: "My crew or guild turned on me, or I turned on them first.",
          detailPrompt: "Name who you can never trust again.",
          detailTemplate: (d) => `I can never trust ${d} again.`,
        },
        {
          text: "I was caught, and the price nearly cost me everything.",
          detailPrompt: "Carry the mark of that punishment.",
          detailTemplate: (d) => `I still carry ${d}, the mark of that punishment.`,
        },
        {
          text: "I took one job too many for someone who now owns a piece of my future.",
          detailPrompt: "Name what you owe them.",
          detailTemplate: (d) => `I owe them ${d}.`,
        },
        {
          text: "I stole something I couldn't bring myself to sell or return.",
          detailPrompt: "Describe what it is - you still have it.",
          detailTemplate: (d) => `I still have ${d}.`,
        },
      ],
    },
  },
  Scout: {
    beat1: {
      title: "Formative Influence",
      prompt: "Who or what first shaped you?",
      options: [
        { text: "I grew up in a family of hunters or trappers, and could read a game trail before I could read words.", attr: "DEX" },
        { text: "My family lived on a frontier edge, where the difference between safe and unsafe ground was something I learned by walking it.", attr: "WIL" },
        {
          text: "I was raised by a solitary relative or mentor who preferred the woods to other people.",
          attr: "INT",
          detailPrompt: "Name what they taught you first.",
          detailTemplate: (d) => `${d} was what they taught me first.`,
        },
        { text: "I was lost in wilderness alone as a child and found my own way back.", attr: "WIL" },
        { text: "My family guided travelers, merchants, or pilgrims through dangerous country for coin.", attr: "INT" },
        { text: "I spent my childhood roaming farther from home than anyone realized, and never told anyone what I saw out there.", attr: "DEX" },
      ],
    },
    beat2: {
      title: "Early Hardship",
      prompt: "What tested you before your working life?",
      options: [
        { text: "I survived a season alone in the wild after being separated from everyone I knew.", attr: "WIL" },
        { text: "I was caught poaching or trespassing on land that wasn't mine, and it changed how I moved through the world.", attr: "DEX" },
        { text: "I tracked something - an animal, a person - for days before I caught up to it, and wished afterward that I hadn't.", attr: "INT" },
        { text: "I carried an injured companion out of dangerous country on my own back.", attr: "STR" },
        { text: "I was the only one who noticed the warning signs before disaster struck, and no one believed me in time.", attr: "INT" },
        { text: "I learned to move without being heard or seen, because getting caught meant real danger, not just embarrassment.", attr: "DEX" },
      ],
    },
    beat3: {
      title: "Years Beyond the Roads",
      prompt: "What did years beyond the roads make of you?",
      options: [
        { text: "I served as a hunter or forager who fed more than just my own household.", attr: "STR" },
        { text: "I worked as a border warden, watching a line on a map that mattered to people who never crossed it themselves.", attr: "WIL" },
        { text: "I guided merchants, pilgrims, or fugitives through country that killed the unprepared.", attr: "INT" },
        { text: "I lived for a time among people who didn't share my language or customs, and learned to read intention instead of words.", attr: "INT" },
        { text: "I spent years tracking something specific - a person, a creature, a debt - across long distances.", attr: "DEX" },
        { text: "I worked alone for so long that company started to feel like the unfamiliar thing.", attr: "WIL" },
      ],
    },
    beat4: {
      title: "Breaking Point",
      prompt: "Why did that life end?",
      options: [
        {
          text: "I tracked someone to the end and found I couldn't finish what I'd been sent to do.",
          detailPrompt: "Name who you let go.",
          detailTemplate: (d) => `I let ${d} go.`,
        },
        {
          text: "I led a group into country I thought I knew, and not everyone came back out.",
          detailPrompt: "Name who didn't.",
          detailTemplate: (d) => `${d} did not come back.`,
        },
        {
          text: "I found something in the wild that shouldn't exist, and I've been quietly avoiding that stretch of country ever since.",
          detailPrompt: "Tell the GM what you found.",
          detailTemplate: (d) => `I found ${d}.`,
        },
        {
          text: "Whoever paid me to watch the border stopped paying, and I kept watching anyway - or stopped, and still wonder if that was the mistake.",
          detailPrompt: "Name what you're still watching for.",
          detailTemplate: (d) => `I am still watching for ${d}.`,
        },
        {
          text: "I was blamed for a death I didn't cause, in country far from anyone who could vouch for me.",
          detailPrompt: "Name who blamed you.",
          detailTemplate: (d) => `${d} blamed me.`,
        },
        {
          text: "The wild place I knew best was burned, flooded, or otherwise destroyed, and I have nowhere that feels like mine anymore.",
          detailPrompt: "Describe what was lost.",
          detailTemplate: (d) => `I lost ${d}.`,
        },
      ],
    },
  },
};
