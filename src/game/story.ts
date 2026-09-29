// WarriorCatsRPG — Story Mode: the Into the Wild narrative chain.
//
// The player's own cat walks THROUGH the Book 1 era alongside the canon cast.
// The player never replaces Firepaw: Rusty, then Firepaw, live in the world
// as NPCs (Rusty in Twolegplace at the start, Firepaw in ThunderClan camp
// once apprenticed), and the steps below stage the book's arc around the
// player's own progression.
//
// TIMELINE RULES
//  - step 0: kittypet days. Rusty is an NPC in Twolegplace.
//  - step 1: the Sunningrocks ambush — Redtail's death happens BETWEEN
//    step 1 and step 2 (characters.ts: storyUntil: 1). After this point
//    Redtail never appears in Story Mode again and Lionheart is deputy.
//  - steps 2+: the player joins ThunderClan alongside the canon apprentices.
//
// This chain APPENDS to the original mission list: legacy save files store a
// step index, so the order below is compatible (early steps kept, later ones
// re-authored in place, new steps appended at the end).

import { TILE } from "./world";
import { TC_OX, TC_OY } from "./world";

export type StoryObjective =
  | { kind: "talk"; targetNpc: string }
  | { kind: "enter"; interior: string }
  | { kind: "visit"; areaId: string }
  | { kind: "hunt"; prey: number }
  | { kind: "patrol"; marker: string }
  | { kind: "camp"; radius: number };

export interface StoryStep {
  id: string;
  chapter: string;
  title: string;
  /** shown as the mission brief when the step becomes active */
  brief: string;
  objective: StoryObjective;
  /** objective progress text, e.g. "Mice caught" */
  objectiveLabel: string;
  /** optional amount for counted objectives */
  count?: number;
  /** dialogue said by a narrator/NPC on completion */
  onComplete?: { speaker: string; text: string }[];
  /** rank the player holds during this step (flavor) */
  rankAs?: string;
}

const t = (n: number) => n * TILE;

export const storySteps: StoryStep[] = [
  {
    id: "s1-twolegplace",
    chapter: "Chapter 1",
    title: "A Kittypet's Curiosity",
    brief:
      "You are a kittypet in Twolegplace, on the very street where Rusty and Smudge live. The forest beyond the garden fence calls to you. Meet Smudge by the gardens, then pad to the edge of the trees.",
    objective: { kind: "talk", targetNpc: "smudge" },
    objectiveLabel: "Talk to Smudge in Twolegplace",
    rankAs: "Kittypet",
    onComplete: [
      {
        speaker: "Smudge",
        text: "You're really going, aren't you? Rusty talks the same way. Henry says the forest cats fight bears! …Just come back before the Twolegs lock the cat door.",
      },
    ],
  },
  {
    id: "s2-into-forest",
    chapter: "Chapter 1",
    title: "Into the Forest",
    brief:
      "Slip under the fence and follow the scent trail north into ThunderClan territory. Reach the edge of the trees where the forest begins.",
    objective: { kind: "visit", areaId: "tallpines" },
    objectiveLabel: "Walk to Tallpines at the forest edge",
    rankAs: "Kittypet",
    onComplete: [
      {
        speaker: "Narrator",
        text: "The forest closed around you like green darkness. Somewhere among the trees, eyes were watching — and somewhere deeper, a battle was ending at a place called Sunningrocks.",
      },
    ],
  },
  {
    id: "s3-graypaw",
    chapter: "Chapter 2",
    title: "An Apprentice Attacks",
    brief:
      "A gray shape leaps from the undergrowth! It's Graypaw, a ThunderClan apprentice. Find him near the forest edge and speak with him.",
    objective: { kind: "talk", targetNpc: "graypaw" },
    objectiveLabel: "Meet Graypaw",
    rankAs: "Kittypet",
    onComplete: [
      {
        speaker: "Graypaw",
        text: "Good fight! You'd have made a decent warrior — for a kittypet. Come on, Bluestar's waiting. You're going to ThunderClan camp!",
      },
    ],
  },
  {
    id: "s4-the-camp",
    chapter: "Chapter 2",
    title: "ThunderClan Camp",
    brief:
      "Graypaw leads you through the gorse tunnel into the camp. Look around: the dens, the fresh-kill pile, and Tallrock where Bluestar waits. The Clan is in mourning — their deputy, Redtail, was killed at Sunningrocks.",
    objective: { kind: "camp", radius: 300 },
    objectiveLabel: "Enter the ThunderClan camp clearing",
    rankAs: "Kittypet",
    onComplete: [
      {
        speaker: "Narrator",
        text: "You stepped into a sandy clearing ringed by brambles. Cats turned to stare — and grief hung over them. On the great Tallrock, a blue-gray she-cat watched you with unreadable eyes. Redtail is dead. The Clan will not soon forget it.",
      },
    ],
  },
  {
    id: "s5-bluestar",
    chapter: "Chapter 3",
    title: "Bluestar's Offer",
    brief:
      "Bluestar has been watching you, kittypet. Climb to her and hear what the leader of ThunderClan has to say.",
    objective: { kind: "talk", targetNpc: "bluestar" },
    objectiveLabel: "Speak with Bluestar",
    rankAs: "Kittypet",
    onComplete: [
      {
        speaker: "Bluestar",
        text: "Fire alone can save our Clan. Will you leave your Twolegs and join us? The Clan will test you first — as is right. We buried Redtail yesterday; today, life goes on. That is the Clan's way.",
      },
    ],
  },
  {
    id: "s6-test-lionheart",
    chapter: "Chapter 3",
    title: "The Clan's Test",
    brief:
      "Lionheart — senior warrior and now the Clan's steady paw — circles you, judging every whisker. Prove your courage: speak with Lionheart and accept the Clan's terms.",
    objective: { kind: "talk", targetNpc: "lionheart" },
    objectiveLabel: "Speak with Lionheart",
    rankAs: "Kittypet",
    onComplete: [
      {
        speaker: "Lionheart",
        text: "You didn't flinch. Good. The Clan is raw with Redtail's loss — we need brave cats more than ever. Tomorrow at dawn your apprenticeship begins, if StarClan wills it.",
      },
    ],
  },
  {
    id: "s7-firepaw",
    chapter: "Chapter 4",
    title: "Named Before StarClan",
    brief:
      "At moonhigh the Clan gathers beneath Tallrock. New names are given — you, and a certain flame-colored kittypet too. Share tongues with Spottedleaf, who will watch your training.",
    objective: { kind: "talk", targetNpc: "spottedleaf" },
    objectiveLabel: "Meet Spottedleaf, the medicine cat",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Spottedleaf",
        text: "Welcome, apprentice. I dreamed of a flame among the bracken — Rusty received his name beside yours tonight: Firepaw. Learn well, and ThunderClan will be glad of you both.",
      },
    ],
  },
  {
    id: "s8-hunt-first",
    chapter: "Chapter 4",
    title: "First Hunt",
    brief:
      "An apprentice hunts for the Clan before feeding itself. Head into the forest and catch prey for the fresh-kill pile.",
    objective: { kind: "hunt", prey: 2 },
    objectiveLabel: "Catch prey",
    count: 2,
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Graypaw",
        text: "Not bad! Drop it on the pile — elders eat first. That's the warrior code. Firepaw's hunting somewhere past the Owl Tree; you two will get along.",
      },
    ],
  },
  {
    id: "s9-training",
    chapter: "Chapter 5",
    title: "Battle Training",
    brief:
      "Whitestorm trains the apprentices at the Sandy Hollow: the crouch, the pounce, the belly rake. Meet him there and practice until your paws ache.",
    objective: { kind: "visit", areaId: "sandy" },
    objectiveLabel: "Train at the Sandy Hollow",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Whitestorm",
        text: "Better. Keep your tail down and your eyes forward. A warrior's first weapon is patience — Sandpaw could learn to borrow some, and Firepaw to slow his down.",
      },
    ],
  },
  {
    id: "s10-border-patrol",
    chapter: "Chapter 6",
    title: "Walking the Borders",
    brief:
      "A border patrol walks to the river with Lionheart, now the Clan's deputy. Check the border marker at the western river and renew the scent.",
    objective: { kind: "patrol", marker: "bm-tc-west" },
    objectiveLabel: "Check the river border marker",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Lionheart",
        text: "RiverClan scent, fresh along the stones. Redtail died holding this border. Stay alert, apprentice — this ground has bled before.",
      },
    ],
  },
  {
    id: "s11-riverclan",
    chapter: "Chapter 7",
    title: "Across the Water",
    brief:
      "Scent-markers by the stepping stones: RiverClan warriors. Cross and hear what they have to say — or listen from the bank. Speak with Oakheart.",
    objective: { kind: "talk", targetNpc: "oakheart" },
    objectiveLabel: "Encounter RiverClan — speak with Oakheart",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Oakheart",
        text: "So Bluestar takes strays from the Twoleg gardens now? The river keeps RiverClan strong, little forest-cat. What keeps ThunderClan strong these days?",
      },
    ],
  },
  {
    id: "s12-shadowclan-scent",
    chapter: "Chapter 8",
    title: "ShadowClan Shadows",
    brief:
      "Ravenpaw trembles by the apprentices' den — he saw ShadowClan warriors over the border. Find Yellowfang hiding in Snakerocks and learn the truth.",
    objective: { kind: "talk", targetNpc: "yellowfang" },
    objectiveLabel: "Find Yellowfang at Snakerocks",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Yellowfang",
        text: "You found me. Clever nose. Tell Bluestar… no. Tell no one. A medicine cat's debts are her own. And stay away from Tigerclaw, kit. He smells stories everywhere.",
      },
    ],
  },
  {
    id: "s13-windclan-moor",
    chapter: "Chapter 9",
    title: "The Open Moor",
    brief:
      "At the Gathering, WindClan's moor cats speak of stolen prey. Travel to their camp across the stepping stones and speak with Tallstar.",
    objective: { kind: "talk", targetNpc: "tallstar" },
    objectiveLabel: "Visit WindClan and speak with Tallstar",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Tallstar",
        text: "A ThunderClan cat on the moor! You have sharp eyes, young one. Run with us once, and your legs will never forget it.",
      },
    ],
  },
  {
    id: "s14-gathering",
    chapter: "Chapter 10",
    title: "The Gathering",
    brief:
      "Full moon rises over Fourtrees. Walk to the four great oaks where all four Clans meet in truce, and listen to the leaders speak.",
    objective: { kind: "visit", areaId: "fourtrees" },
    objectiveLabel: "Attend the Gathering at Fourtrees",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Bluestar",
        text: "Cats of all Clans — ThunderClan is proud to present its newest apprentices. Though ShadowClan's shadow grows, the truce of the full moon holds.",
      },
    ],
  },
  {
    id: "s15-moonstone",
    chapter: "Chapter 11",
    title: "The Moonstone",
    brief:
      "Bluestar takes the apprentices to Mothermouth at Highstones, where the Moonstone burns with StarClan's light. Enter the cave and share dreams.",
    objective: { kind: "enter", interior: "moonstone-cave" },
    objectiveLabel: "Enter Mothermouth",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Narrator",
        text: "Deep in the cave the Moonstone glowed, and in its light you saw warriors of starlight watching — beside you, Firepaw's eyes shone with the same fire of belonging.",
      },
    ],
  },
  {
    id: "s16-final-battle",
    chapter: "Chapter 12",
    title: "Battle for the Sunningrocks",
    brief:
      "ShadowClan attacks the river border! Defend Sunningrocks with the patrol — and afterward, Ravenpaw may finally whisper what really happened the day Redtail fell.",
    objective: { kind: "visit", areaId: "sunningrocks" },
    objectiveLabel: "Defend Sunningrocks",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Ravenpaw",
        text: "You fought well. Braver than me. Listen — before Tigerclaw finds us — I was THERE when Redtail died. It wasn't Oakheart. I saw it. I saw TIGERCLAW. Please… be careful who you tell.",
      },
    ],
  },
  {
    id: "s17-epilogue",
    chapter: "Epilogue",
    title: "The Forest Remembers",
    brief:
      "The Clan is fed, the borders hold, and the apprentices are becoming warriors. Graypaw waits by the fresh-kill pile to share tongues with the Clan's newest hunter — you.",
    objective: { kind: "talk", targetNpc: "graypaw" },
    objectiveLabel: "Share tongues with Graypaw",
    rankAs: "Apprentice",
    onComplete: [
      {
        speaker: "Narrator",
        text: "Under a sky salted with stars — Silverpelt, the cats call it — the Clan settled into the night. Firepaw's fire was just beginning, and so was yours. The forest's story was far from over.",
      },
    ],
  },
];
