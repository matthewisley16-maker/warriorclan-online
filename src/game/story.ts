// WarriorCatsRPG — Story Mode: the Into the Wild mission chain.

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
      "You are Rusty, a kittypet in Twolegplace. The forest beyond the garden fence calls to you. Meet Smudge by the gardens, then pad to the edge of the trees.",
    objective: { kind: "talk", targetNpc: "smudge" },
    objectiveLabel: "Talk to Smudge in Twolegplace",
    onComplete: [
      {
        speaker: "Smudge",
        text: "You're really going, aren't you? Henry says the forest cats fight bears! …Just come back before the Twolegs lock the cat door.",
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
    onComplete: [
      {
        speaker: "Narrator",
        text: "The forest closed around Rusty like green darkness. Somewhere among the trees, eyes were watching him.",
      },
    ],
  },
  {
    id: "s3-graypaw",
    chapter: "Chapter 1",
    title: "An Apprentice Attacks",
    brief:
      "A gray shape leaps from the undergrowth! It's Graypaw, a ThunderClan apprentice. Find him near the forest edge and speak with him.",
    objective: { kind: "talk", targetNpc: "graypaw" },
    objectiveLabel: "Meet Graypaw",
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
      "Graypaw leads you through the gorse tunnel into the camp. Look around: the dens, the fresh-kill pile, and Tallrock where Bluestar waits.",
    objective: { kind: "camp", radius: 300 },
    objectiveLabel: "Enter the ThunderClan camp clearing",
    onComplete: [
      {
        speaker: "Narrator",
        text: "Rusty stepped into a sandy clearing ringed by brambles. Cats turned to stare. On the great Tallrock, a blue-gray she-cat watched him with unreadable eyes.",
      },
    ],
  },
  {
    id: "s5-bluestar",
    chapter: "Chapter 2",
    title: "Bluestar's Offer",
    brief:
      "Bluestar has been watching you, kittypet. Climb to her and hear what the leader of ThunderClan has to say.",
    objective: { kind: "talk", targetNpc: "bluestar" },
    objectiveLabel: "Speak with Bluestar",
    onComplete: [
      {
        speaker: "Bluestar",
        text: "Fire alone can save our Clan. Will you leave your Twolegs and join us, Rusty? The Clan will test you first — as is right.",
      },
    ],
  },
  {
    id: "s6-test-lionheart",
    chapter: "Chapter 3",
    title: "The Clan's Test",
    brief:
      "Lionheart and Tigerclaw circle you, judging every whisker. Prove your courage — speak with Lionheart and accept the Clan's terms.",
    objective: { kind: "talk", targetNpc: "lionheart" },
    objectiveLabel: "Speak with Lionheart",
    onComplete: [
      {
        speaker: "Lionheart",
        text: "You didn't flinch. Good. Tomorrow at dawn your apprenticeship begins — if StarClan wills it.",
      },
    ],
  },
  {
    id: "s7-firepaw",
    chapter: "Chapter 3",
    title: "Named Before StarClan",
    brief:
      "At moonhigh the Clan gathers beneath Tallrock. Bluestar gives you a new name: Firepaw. Share tongues with Spottedleaf, who will watch your training.",
    objective: { kind: "talk", targetNpc: "spottedleaf" },
    objectiveLabel: "Meet Spottedleaf, the medicine cat",
    onComplete: [
      {
        speaker: "Spottedleaf",
        text: "Welcome, Firepaw. I sensed you coming in a dream — a flame among the bracken. Learn well, and ThunderClan will be glad of you.",
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
    onComplete: [
      {
        speaker: "Graypaw",
        text: "Not bad, kittypet! Drop it on the pile — elders eat first. That's the warrior code.",
      },
    ],
  },
  {
    id: "s9-training",
    chapter: "Chapter 5",
    title: "Battle Training",
    brief:
      "Whitestorm trains you at the Sandy Hollow: the crouch, the pounce, the belly rake. Meet him there and practice until your paws ache.",
    objective: { kind: "visit", areaId: "sandy" },
    objectiveLabel: "Train at the Sandy Hollow",
    onComplete: [
      {
        speaker: "Whitestorm",
        text: "Better. Keep your tail down and your eyes forward. A warrior's first weapon is patience.",
      },
    ],
  },
  {
    id: "s10-border-patrol",
    chapter: "Chapter 6",
    title: "Walking the Borders",
    brief:
      "Tigerclaw leads a border patrol to the river. Check the border marker at the western river and renew the scent.",
    objective: { kind: "patrol", marker: "bm-tc-west" },
    objectiveLabel: "Check the river border marker",
    onComplete: [
      {
        speaker: "Tigerclaw",
        text: "RiverClan scent, fresh along the stones. Stay alert, apprentice — this border has bled before.",
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
    onComplete: [
      {
        speaker: "Oakheart",
        text: "So Bluestar takes kittypets now? The river keeps RiverClan strong, Firepaw. What keeps ThunderClan strong — your Twolegs?",
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
    onComplete: [
      {
        speaker: "Yellowfang",
        text: "You found me, flame-paw. Clever nose. Tell Bluestar… no. Tell no one. A medicine cat's debts are her own.",
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
    onComplete: [
      {
        speaker: "Tallstar",
        text: "A ThunderClan cat on the moor! You have sharp eyes, young flame. Run with us once, and your legs will never forget it.",
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
    onComplete: [
      {
        speaker: "Bluestar",
        text: "Cats of all Clans — ThunderClan is proud to present its newest apprentice: Firepaw!",
      },
    ],
  },
  {
    id: "s15-moonstone",
    chapter: "Chapter 11",
    title: "The Moonstone",
    brief:
      "Bluestar takes you to Mothermouth at Highstones, where the Moonstone burns with StarClan's light. Enter the cave and share dreams.",
    objective: { kind: "enter", interior: "moonstone-cave" },
    objectiveLabel: "Enter Mothermouth",
    onComplete: [
      {
        speaker: "Narrator",
        text: "Deep in the cave the Moonstone glowed, and in its light Firepaw saw warriors of starlight watching — and knew ThunderClan was his forever.",
      },
    ],
  },
  {
    id: "s16-final-battle",
    chapter: "Chapter 12",
    title: "Battle for the Sunningrocks",
    brief:
      "ShadowClan attacks! Tigerclaw's patrol bleeds at Sunningrocks, and only Ravenpaw knows the truth of what happened there. Go to Sunningrocks and defend the border.",
    objective: { kind: "visit", areaId: "sunningrocks" },
    objectiveLabel: "Defend Sunningrocks",
    onComplete: [
      {
        speaker: "Bluestar",
        text: "You fought like a warrior of the oldest blood, Firepaw. ThunderClan is honored — and StarClan's prophecy stirs. Your story has only begun.",
      },
    ],
  },
];
