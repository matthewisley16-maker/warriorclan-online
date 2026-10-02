// WarriorCatsRPG — Story Mode cinematic layer (§2/§3/§5/§7/§35).
//
// Beats are SHORT, character-voiced scene scripts that the React layer plays
// through the engine's cinematic camera while the world stays alive behind
// them. Cats never speak human words: written dialogue appears on screen and
// each line carries a SHORT per-character vocalization (vocal.ts profiles) —
// the Undertale-style dialogue concept, but with cat sounds.
//
// Beats alternate CUTSCENE → GAMEPLAY (§2): each story step gets a brief
// intro beat (its mission brief, spoken by the relevant character), and the
// big pivot steps (s2 forest, s4 camp arrival, s14 Gathering, s16 battle)
// get slightly larger cinematic staging. Dialogue lines support CHOICES (§7)
// so the player answers in their own voice.

import type { CineStep } from "./engine";
import type { VocalEmotion } from "./vocal";

export interface CineLine {
  /** display name ("Bluestar", "Narrator", or "You" for the player cat) */
  speaker: string;
  /** speaker id for the vocal profile ("player" = the player's cat, §21) */
  speakerId: string;
  text: string;
  /** vocal emotion; inferred from text when omitted (§17) */
  emotion?: VocalEmotion;
  /** engine NPC to direct during this line (pose/head/tail/look-at, §4) */
  act?: { npcId: string; pose?: "sit" | "groom" | "sleep"; head?: "nod" | "shake" | "look" | "sniff"; tail?: boolean; lookAt?: "player" | "none" };
  /** optional camera target for this line (npc id or "player") */
  cam?: { npcId: string } | { player: true };
  /** optional camera zoom for this line (1 = normal, 1.35 = close-up) */
  zoom?: number;
  /** ms the line holds before the next (read time; also gates its vocal) */
  holdMs?: number;
}

export interface CineChoice {
  label: string;
  /** the player-cat's line shown after choosing (with its own vocal, §21) */
  playerLine: string;
  /** the NPC's reply line (auto-voiced with their profile) */
  reply: CineLine;
}

export interface StoryBeat {
  /** play once per step id (remembered for the session) */
  id: string;
  lines: CineLine[];
  /** §7: choices offered after the scripted lines (first matching beat) */
  choices?: CineChoice[];
  /** world position the camera opens on (defaults: player) */
  openOn?: { x: number; y: number };
  /** ambient/voice styling handled by the player component */
}

const L = (
  speaker: string,
  speakerId: string,
  text: string,
  opts: Partial<Omit<CineLine, "speaker" | "speakerId" | "text">> = {},
): CineLine => ({ speaker, speakerId, text, ...opts });

/** §5: the polished Story Mode opening — environment → character → situation. */
export const STORY_INTRO: StoryBeat = {
  id: "intro",
  openOn: { x: 78 * 32, y: 146 * 32 }, // Rusty's garden street
  lines: [
    L("Narrator", "narrator", "Greenleaf in Twolegplace. The Twolegs have gone out; the gardens lie quiet in the sun.", { holdMs: 3400, zoom: 0.95 }),
    L("Narrator", "narrator", "You are a kittypet — well fed, well petted, and utterly bored of the fence line.", { holdMs: 3200 }),
    L("Narrator", "narrator", "But beyond the garden wall, the forest is calling. It has been calling for days.", { holdMs: 3200 }),
    L("You", "player", "…Just a little closer to the trees. What could it hurt?", { emotion: "excited", holdMs: 2600, zoom: 1.25 }),
    L("Narrator", "narrator", "This is the story of how a house cat walked into the wild — and found a Clan waiting.", { holdMs: 3000, zoom: 0.95 }),
  ],
};

/** Per-step cinematic beats (§2/§9): intro line(s) voiced by the scene's NPC. */
export const STORY_BEATS: Record<string, StoryBeat> = {
  "s1-twolegplace": {
    id: "s1",
    lines: [
      L("Smudge", "smudge", "Rusty! Over here — I was starting to think you'd been eaten by the Vacuum Cleaner.", { emotion: "happy", act: { npcId: "smudge", tail: true, lookAt: "player" }, cam: { npcId: "smudge" }, holdMs: 3000 }),
      L("You", "player", "I keep hearing things from the forest at night. Fighting. Yowling. Doesn't it make you curious?", { holdMs: 2800 }),
      L("Smudge", "smudge", "Curious? Henry says the forest cats fight FOXES. I'm curious about dinner, myself.", { emotion: "confused", holdMs: 3000 }),
    ],
    choices: [
      {
        label: "I'm going to the edge of the trees. Today.",
        playerLine: "I'm going to the edge of the trees. Today.",
        reply: L("Smudge", "smudge", "You're really going, aren't you? …Just come back before the Twolegs lock the cat door.", { emotion: "sad", holdMs: 3000 }),
      },
      {
        label: "Maybe I'll just patrol the garden. Again.",
        playerLine: "Maybe I'll just patrol the garden. Again.",
        reply: L("Smudge", "smudge", "Good cat. The wildest thing out here is the neighbor's rottweiler anyway.", { emotion: "happy", holdMs: 2800 }),
      },
    ],
  },

  "s2-into-forest": {
    id: "s2",
    lines: [
      L("Narrator", "narrator", "The fence gap is exactly where you left it. The grass smells of dew and distant cat.", { holdMs: 2800 }),
      L("You", "player", "The forest… it's so much BIGGER than it looks from the garden.", { emotion: "surprised", holdMs: 2600 }),
      L("Narrator", "narrator", "Follow the scent trail north, into the pines. And keep your ears up — the forest is watching you back.", { holdMs: 3200 }),
    ],
  },

  "s3-graypaw": {
    id: "s3",
    lines: [
      L("Graypaw", "graypaw", "Hey — get off our territory! …Wait. A KITTYPET? Out HERE?", { emotion: "surprised", act: { npcId: "graypaw", lookAt: "player" }, cam: { npcId: "graypaw" }, holdMs: 3000, zoom: 1.2 }),
      L("You", "player", "I only walked past the trees! I didn't know the forest belonged to anyone.", { emotion: "confused", holdMs: 2600 }),
      L("Graypaw", "graypaw", "Belongs to THUNDERCLAN, every leaf of it. I'm Graypaw, apprentice. And you fought pretty well for a house cat — want to see where we live?", { emotion: "excited", holdMs: 3400 }),
    ],
    choices: [
      {
        label: "Show me everything.",
        playerLine: "Show me everything.",
        reply: L("Graypaw", "graypaw", "That's the spirit! Follow me — and try to keep up, forest-slowpoke.", { emotion: "happy", holdMs: 2600 }),
      },
      {
        label: "I should get home before dark…",
        playerLine: "I should get home before dark…",
        reply: L("Graypaw", "graypaw", "Suit yourself. But the Clan's at camp — and something's happened. Redtail… you'd better just come and hear it.", { emotion: "sad", holdMs: 3200 }),
      },
    ],
  },

  "s4-the-camp": {
    id: "s4",
    openOn: { x: 89 * 32, y: 86 * 32 },
    lines: [
      L("Narrator", "narrator", "Through the gorse tunnel: a sandy clearing ringed by brambles. Dens, fresh-kill, cats — a whole life, hidden from every Twoleg.", { holdMs: 3400, zoom: 1.05 }),
      L("Narrator", "narrator", "The Clan is in mourning. Redtail, their deputy, died at Sunningrocks two moons too soon.", { emotion: "sad", holdMs: 3200 }),
      L("Narrator", "narrator", "On the Tallrock, a blue-gray she-cat watches you with unreadable eyes. That is Bluestar — leader of ThunderClan.", { holdMs: 3200, cam: { npcId: "bluestar" }, zoom: 1.2 }),
    ],
  },

  "s5-bluestar": {
    id: "s5",
    lines: [
      L("Bluestar", "bluestar", "So. The kittypet who crossed our border with his tail up like a warrior.", { emotion: "calm", act: { npcId: "bluestar", lookAt: "player" }, cam: { npcId: "bluestar" }, zoom: 1.2, holdMs: 3200 }),
      L("Bluestar", "bluestar", "I have watched the fire burn in you since you stepped beneath our trees. Fire alone can save our Clan.", { holdMs: 3400 }),
      L("You", "player", "Save your Clan? From what?", { emotion: "confused", holdMs: 2400 }),
      L("Bluestar", "bluestar", "From what is coming. Join us — leave your Twolegs — and ThunderClan will test you, as is right. We buried Redtail yesterday; today, life goes on.", { emotion: "firm", holdMs: 3600 }),
    ],
    choices: [
      {
        label: "Then I'm yours to test, Bluestar.",
        playerLine: "Then I'm yours to test, Bluestar.",
        reply: L("Bluestar", "bluestar", "Then stay, and be welcome. Lionheart will look at you properly. Mrrrow — a long road begins with a single paw-step.", { emotion: "happy", holdMs: 3400 }),
      },
      {
        label: "I need to think about it.",
        playerLine: "I need to think about it.",
        reply: L("Bluestar", "bluestar", "Think quickly, kittypet. The forest does not wait, and neither does the coming shadow.", { emotion: "calm", holdMs: 3000 }),
      },
    ],
  },

  "s6-test-lionheart": {
    id: "s6",
    lines: [
      L("Lionheart", "lionheart", "Circle with me, kittypaw. A Clanmate who flinches at shadows is worse than no Clanmate at all.", { act: { npcId: "lionheart", lookAt: "player" }, cam: { npcId: "lionheart" }, holdMs: 3200 }),
      L("You", "player", "I won't flinch. I've faced the garden Vacuum.", { emotion: "excited", holdMs: 2400 }),
      L("Lionheart", "lionheart", "Ha! You didn't run from Graypaw's ambush either. Good. Tomorrow at dawn, your apprenticeship begins — if StarClan wills it.", { emotion: "happy", holdMs: 3400 }),
    ],
  },

  "s7-firepaw": {
    id: "s7",
    lines: [
      L("Spottedleaf", "spottedleaf", "Welcome, little flame. I dreamed of fire among the bracken — and here you both stand, named before StarClan.", { emotion: "calm", act: { npcId: "spottedleaf", lookAt: "player" }, cam: { npcId: "spottedleaf" }, zoom: 1.15, holdMs: 3400 }),
      L("You", "player", "Named? I have a name already… don't I?", { emotion: "confused", holdMs: 2400 }),
      L("Spottedleaf", "spottedleaf", "You carry an apprentice name now, as does the flame-colored kittypet beside your story — Firepaw, they called him tonight. Learn well, and ThunderClan will be glad of you both.", { emotion: "happy", holdMs: 3600 }),
    ],
  },

  "s8-hunt-first": {
    id: "s8",
    lines: [
      L("Graypaw", "graypaw", "An apprentice hunts for the Clan before feeding itself — that's the warrior code. Crouch LOW, tail still, and pounce when the mouse turns.", { emotion: "calm", holdMs: 3400 }),
      L("You", "player", "Two pieces of fresh-kill. Watch me.", { emotion: "excited", holdMs: 2200 }),
    ],
  },

  "s9-training": {
    id: "s9",
    lines: [
      L("Whitestorm", "whitestorm", "Welcome to the Sandy Hollow, where ThunderClan hones its claws. The crouch. The pounce. The belly rake. Show me what StarClan gave you.", { act: { npcId: "whitestorm", lookAt: "player" }, cam: { npcId: "whitestorm" }, holdMs: 3600 }),
      L("You", "player", "I've been waiting for this since the fence.", { emotion: "firm", holdMs: 2400 }),
    ],
  },

  "s10-border-patrol": {
    id: "s10",
    lines: [
      L("Lionheart", "lionheart", "The border patrol renews the scent every sun-high. Walk with me — and remember, the river border has bled before.", { emotion: "calm", holdMs: 3200 }),
      L("Lionheart", "lionheart", "There. RiverClan scent, fresh along the stones. Redtail died holding this ground. Stay alert, apprentice.", { emotion: "firm", holdMs: 3200 }),
    ],
  },

  "s11-riverclan": {
    id: "s11",
    lines: [
      L("Oakheart", "oakheart", "Well, well. Bluestar takes strays from the Twoleg gardens now, does she?", { act: { npcId: "oakheart", lookAt: "player" }, cam: { npcId: "oakheart" }, holdMs: 3200 }),
      L("You", "player", "I'm ThunderClan. What does the river matter to you — isn't it enough that you HAVE it?", { emotion: "firm", holdMs: 2800 }),
      L("Oakheart", "oakheart", "Mrrrow. The river keeps RiverClan strong, little forest-cat. The question is what keeps THUNDERCLAN strong these days.", { emotion: "calm", holdMs: 3400 }),
    ],
  },

  "s12-shadowclan-scent": {
    id: "s12",
    lines: [
      L("Yellowfang", "yellowfang", "Trespassing apprentice! Haven't you been taught to leave a sick old she-cat in peace?", { emotion: "angry", act: { npcId: "yellowfang", lookAt: "player" }, cam: { npcId: "yellowfang" }, zoom: 1.2, holdMs: 3200 }),
      L("You", "player", "You're ThunderClan's missing medicine cat — the whole forest is looking for you.", { emotion: "confused", holdMs: 2800 }),
      L("Yellowfang", "yellowfang", "Then the whole forest can keep looking. Tell Bluestar… no. Tell NO ONE. A medicine cat's debts are her own. And stay away from Tigerclaw, kit. He smells stories everywhere.", { emotion: "sad", holdMs: 3800 }),
    ],
  },

  "s13-windclan-moor": {
    id: "s13",
    lines: [
      L("Tallstar", "tallstar", "A ThunderClan cat on MY moor, and bold enough to say hello! You have sharp eyes, young one — and thin legs. WindClan legs, nearly.", { act: { npcId: "tallstar", lookAt: "player" }, cam: { npcId: "tallstar" }, holdMs: 3400 }),
      L("You", "player", "The Clans say WindClan's prey has been stolen. Is it true?", { emotion: "confused", holdMs: 2600 }),
      L("Tallstar", "tallstar", "Run with us once across the open moor, and your legs will never forget it. Then we shall talk of thieves and borders, ThunderClan kit.", { emotion: "calm", holdMs: 3400 }),
    ],
  },

  "s14-gathering": {
    id: "s14",
    lines: [
      L("Narrator", "narrator", "Full moon over Fourtrees. Four great oaks, four Clans, one truce as old as the forest itself.", { holdMs: 3200, zoom: 0.95 }),
      L("Bluestar", "bluestar", "Cats of all Clans — ThunderClan is proud to present its newest apprentices. Though ShadowClan's shadow grows, the truce of the full moon holds.", { emotion: "calm", holdMs: 3600 }),
      L("You", "player", "So MANY cats… and for one night, peace.", { emotion: "happy", holdMs: 2600 }),
    ],
  },

  "s15-moonstone": {
    id: "s15",
    lines: [
      L("Narrator", "narrator", "Highstones. Mothermouth. The cave breathes cold, and deep inside, something glows like a caged star.", { holdMs: 3200 }),
      L("Narrator", "narrator", "In the Moonstone's light you see them — warriors of starlight, watching. Firepaw's eyes shine with the same fire of belonging you feel in your own chest.", { emotion: "calm", holdMs: 3800 }),
      L("You", "player", "StarClan… I'm listening.", { emotion: "calm", holdMs: 2400 }),
    ],
  },

  "s16-final-battle": {
    id: "s16",
    lines: [
      L("Narrator", "narrator", "ShadowClan pours over the border! The patrol lines meet on the wet stones of Sunningrocks — this is what you trained for.", { emotion: "firm", holdMs: 3400, zoom: 0.95 }),
      L("You", "player", "For ThunderClan!", { emotion: "excited", holdMs: 2000 }),
      L("Ravenpaw", "ravenpaw", "You fought well. Braver than me. Listen — before Tigerclaw finds us — I was THERE when Redtail died. It wasn't Oakheart. I saw it. I saw TIGERCLAW. Please… be careful who you tell.", { emotion: "scared", act: { npcId: "ravenpaw", lookAt: "player" }, cam: { npcId: "ravenpaw" }, zoom: 1.25, holdMs: 4200 }),
    ],
    choices: [
      {
        label: "Your secret is safe with me.",
        playerLine: "Your secret is safe with me.",
        reply: L("Ravenpaw", "ravenpaw", "Thank you. Just… be careful, friend. Some shadows have long claws.", { emotion: "sad", holdMs: 2800 }),
      },
      {
        label: "The Clan must hear the truth.",
        playerLine: "The Clan must hear the truth.",
        reply: L("Ravenpaw", "ravenpaw", "And who would BELIEVE an apprentice over a senior warrior? Think, friend. Think carefully.", { emotion: "angry", holdMs: 3000 }),
      },
    ],
  },

  "s17-epilogue": {
    id: "s17",
    lines: [
      L("Graypaw", "graypaw", "Here — the best spot on the fresh-kill pile is yours tonight. You earned it, forest-slowpoke.", { emotion: "happy", act: { npcId: "graypaw", tail: true, lookAt: "player" }, cam: { npcId: "graypaw" }, holdMs: 3200 }),
      L("You", "player", "A moon ago I was staring over a garden fence. Now I have a Clan.", { emotion: "happy", holdMs: 2800 }),
      L("Narrator", "narrator", "Under Silverpelt the Clan settled into the night. Firepaw's fire was just beginning — and so was yours. The forest's story was far from over.", { emotion: "calm", holdMs: 3800 }),
    ],
  },
};

/** §3: camera choreography derived from a beat's lines (pan → focus → zoom). */
export function beatCameraSteps(beat: StoryBeat, npcPos: (id: string) => { x: number; y: number } | null, playerPos: { x: number; y: number }): CineStep[] {
  const steps: CineStep[] = [];
  const start = beat.openOn ?? playerPos;
  steps.push({ kind: "pan", target: start, durMs: 900, ease: "inout" });
  let lastTarget: { x: number; y: number } = start;
  for (const line of beat.lines) {
    if (line.cam && "npcId" in line.cam) {
      const p = npcPos(line.cam.npcId);
      if (p) {
        steps.push({ kind: "pan", target: p, durMs: 1100, ease: "inout" });
        lastTarget = p;
      }
    } else if (line.cam && "player" in line.cam) {
      steps.push({ kind: "pan", target: playerPos, durMs: 900, ease: "inout" });
      lastTarget = playerPos;
    }
    if (line.zoom !== undefined) steps.push({ kind: "zoom", zoom: line.zoom, durMs: 700, ease: "out" });
  }
  void lastTarget;
  steps.push({ kind: "followPlayer", durMs: 600 });
  steps.push({ kind: "zoom", zoom: 1, durMs: 600, ease: "out" });
  return steps;
}
