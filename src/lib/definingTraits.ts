// The d66 Defining Trait table (§3.4). d66 = two d6 read as a tens digit and
// a ones digit (not added together), giving 36 possible results.

export type DefiningTrait = {
  name: string;
  text: string;
};

export const DEFINING_TRAITS: Record<number, DefiningTrait> = {
  11: { name: "Ambitious", text: "You want more than this, and everyone can tell." },
  12: { name: "Bitter", text: "You keep a ledger of every slight, and you are never wrong about the entries." },
  13: { name: "Blunt", text: "You say the thing everyone else is working around, and you rarely soften it." },
  14: { name: "Bold", text: "You speak first, step forward first, and take the front of the line." },
  15: { name: "Compassionate", text: "You notice who is cold, who is limping, and who has been quiet too long." },
  16: { name: "Curious", text: "You touch what you are told not to. You ask the follow-up question." },
  21: { name: "Devout", text: "You keep your observances even when no one else is keeping theirs." },
  22: { name: "Dutiful", text: "You finish what you agreed to, whether or not anyone is still watching." },
  23: { name: "Fatalistic", text: "You believe your end is already written. It makes you calm." },
  24: { name: "Foolhardy", text: "You move first. You work out the cost afterward." },
  25: { name: "Formal", text: "You use titles, keep your posture, and observe the courtesies." },
  26: { name: "Generous", text: "What you have is on the table before anyone thinks to ask." },
  31: { name: "Gentle", text: "You handle people and animals with the same care." },
  32: { name: "Guarded", text: "You answer questions with questions. Your history comes out in pieces." },
  33: { name: "Haunted", text: "Something follows you in your sleep, and it shows on your face by morning." },
  34: { name: "Honest", text: "You never learned to lie well, and you have stopped trying." },
  35: { name: "Honorable", text: "You keep your word past the point where keeping it is convenient." },
  36: { name: "Hot-Tempered", text: "You go from calm to furious with nothing in between." },
  41: { name: "Independent", text: "You would rather do it badly yourself than well by someone else's hand." },
  42: { name: "Jaded", text: "You have seen this before, and it ended the way these things end." },
  43: { name: "Loud", text: "You fill a room. You have never learned the use of a lowered voice." },
  44: { name: "Loyal", text: "You stay past the point where staying is sensible." },
  45: { name: "Meticulous", text: "Everything you own has a place, and you notice when someone has moved it." },
  46: { name: "Patient", text: "You would rather wait three days than force a thing." },
  51: { name: "Pragmatic", text: "You want to know what a thing costs and what it does. The rest is decoration." },
  52: { name: "Protective", text: "You put yourself between people and danger before you have thought about it." },
  53: { name: "Proud", text: "An apology from you is a rare and expensive thing." },
  54: { name: "Restless", text: "Sitting still costs you something. You pace, you tap, you wander off." },
  55: { name: "Scarred", text: "Something visible marks you, and you have decided how you feel about people looking." },
  56: { name: "Sharp-Tongued", text: "Your first instinct is the cutting remark. You have lost friends to it." },
  61: { name: "Skeptical", text: "You want to know how a thing is known before you believe it." },
  62: { name: "Soft-Spoken", text: "People lean in to hear you. You have learned that this is useful." },
  63: { name: "Solitary", text: "Company tires you. You take the watch nobody else wants." },
  64: { name: "Stoic", text: "Whatever happens, your hands do not shake. People notice." },
  65: { name: "Stubborn", text: "Once you have said a thing, walking it back feels like dying." },
  66: { name: "Watchful", text: "You clock the exits, the hands, and the person who has not spoken yet." },
};

export function rollD66Trait(rollDieSides: (sides: number) => number): DefiningTrait {
  const roll = rollDieSides(6) * 10 + rollDieSides(6);
  return DEFINING_TRAITS[roll];
}
