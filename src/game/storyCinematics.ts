// WarriorCatsRPG — Story Mode cinematic layer (§2/§3/§5/§7/§35).
//
// Beats are SHORT, character-voiced scene scripts that the React layer plays
// through the engine's cinematic camera while the world stays alive behind
// them. Cats never speak human words: written dialogue appears on screen and
// each line carries a SHORT per-character vocalization (vocal.ts profiles) —
// the Undertale-style dialogue concept, but with cat sounds.
//
// §CINEMATIC (this pass): a beat is now a real SCENE, not a caption sequence.
// Every line carries
//   • a SHOT (wide / medium / two / close) that the camera composes around the
//     live cats — no world distortion, no fake close-ups;
//   • ACTING CUES that the engine performs through the one animation system:
//     turning to face the speaker, stepping closer, sitting, crouching,
//     pouncing, ear-pricks, head shakes, tail flicks and talking mouths.
// So the cats physically act the scene out while the dialogue advances.
//
// Book 1 staging (Into the Wild): the encounter happens in the pines, Graypaw
// leads the kittypet through the gorse tunnel, the camp is in mourning for
// Redtail, Bluestar speaks of fire, and the later beats follow the book's
// order (training, borders, RiverClan, Yellowfang, WindClan, the Gathering,
// the Moonstone, the battle at Sunningrocks and Ravenpaw's secret).

import type { CineStep } from "./engine";
import type { CineShot } from "./cinematic";
import type { CatPose } from "./draw";
import type { VocalEmotion } from "./vocal";

/** One acting direction executed when a line starts (§CINEMATIC). */
export interface CineCue {
  /** "player" or an NPC id */
  who: string;
  /** turn to face someone — resolved to their LIVE position at cue time */
  face?: "player" | string;
  /** held pose (a stationary pose; walking is expressed by `step`) */
  pose?: CatPose;
  head?: "nod" | "shake" | "look" | "sniff";
  tail?: boolean;
  /** ears prick / startle reaction */
  alert?: boolean;
  /**
   * Walk somewhere for real: toward a live cat (stopping a polite gap short)
   * or by a fixed offset from where the cat stands (turning and walking off).
   */
  step?: {
    toward?: "player" | string;
    offset?: { x: number; y: number };
    gap?: number;
    maxPx?: number;
  };
  /** mouth moves for this line (auto-enabled for the speaker) */
  talking?: boolean;
  durMs?: number;
}

export interface CineLine {
  /** display name ("Bluestar", "Narrator", or "You" for the player cat) */
  speaker: string;
  /** speaker id for the vocal profile ("player" = the player's cat, §21) */
  speakerId: string;
  text: string;
  /** vocal emotion; inferred from text when omitted (§17) */
  emotion?: VocalEmotion;
  /** legacy single-actor direction (kept for composed NPC chats) */
  act?: { npcId: string; pose?: "sit" | "groom" | "sleep"; head?: "nod" | "shake" | "look" | "sniff"; tail?: boolean; lookAt?: "player" | "none" };
  /** optional camera target for this line (npc id or "player") */
  cam?: { npcId: string } | { player: true };
  /** optional camera zoom for this line (1 = normal, 1.35 = close-up) */
  zoom?: number;
  /** §CINEMATIC: explicit shot type for this line */
  shot?: CineShot;
  /** §CINEMATIC: who is in frame ("player" / npc ids) */
  focus?: string[];
  /** §CINEMATIC: acting performed when this line starts */
  cues?: CineCue[];
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
  /** §CINEMATIC: the two cats this scene is about (for two-shots/listeners) */
  pair?: [string, string];
}

const L = (
  speaker: string,
  speakerId: string,
  text: string,
  opts: Partial<Omit<CineLine, "speaker" | "speakerId" | "text">> = {},
): CineLine => ({ speaker, speakerId, text, ...opts });

const P = "player" as const;

// ---------------------------------------------------------------------------
// §5: the polished Story Mode opening — environment → character → situation.
// ---------------------------------------------------------------------------
export const STORY_INTRO: StoryBeat = {
  id: "intro",
  openOn: { x: 78 * 32, y: 146 * 32 }, // Rusty's garden street
  pair: [P, "smudge"],
  lines: [
    L("Narrator", "narrator", "Greenleaf lies heavy over Twolegplace. The gardens are quiet; somewhere a lawnmower coughs and gives up.", {
      holdMs: 3200,
      shot: "wide",
      focus: [P],
      cues: [{ who: P, pose: "sit", head: "look", durMs: 3200 }],
    }),
    L("Narrator", "narrator", "You are a kittypet — well fed, well petted, and utterly bored of the same six fence posts.", {
      holdMs: 3000,
      shot: "medium",
      focus: [P],
      cues: [{ who: P, head: "look", tail: true, durMs: 3000 }],
    }),
    L("Narrator", "narrator", "Beyond the garden wall the pines begin. All morning something out there has been calling you.", {
      holdMs: 3000,
      shot: "wide",
      focus: [P],
      cues: [{ who: P, pose: "sit", alert: true, head: "look", durMs: 3000 }],
    }),
    L("You", "player", "…Just a little closer to the trees. What could it hurt?", {
      emotion: "excited",
      holdMs: 2600,
      shot: "close",
      focus: [P],
      cues: [{ who: P, head: "nod", tail: true, durMs: 2600 }],
    }),
    L("Narrator", "narrator", "This is how a house cat walks into the wild — and finds a Clan waiting in the dark of the pines.", {
      holdMs: 3000,
      shot: "wide",
      focus: [P],
    }),
  ],
};

// ---------------------------------------------------------------------------
// Per-step cinematic beats (§2/§9). Each is a small scene, in book order.
// ---------------------------------------------------------------------------
export const STORY_BEATS: Record<string, StoryBeat> = {
  "s1-twolegplace": {
    id: "s1",
    pair: [P, "smudge"],
    lines: [
      L("Narrator", "narrator", "Smudge is waiting by the fence, tail high, as if he has been there all morning.", {
        holdMs: 2800,
        shot: "wide",
        focus: [P, "smudge"],
      }),
      L("Smudge", "smudge", "Rusty! There you are. I was starting to think the vacuum cleaner finally got you.", {
        emotion: "happy",
        holdMs: 3000,
        shot: "close",
        focus: ["smudge"],
        cues: [{ who: "smudge", face: P, step: { toward: P, gap: 54, maxPx: 40 }, tail: true, durMs: 3000 }],
      }),
      L("You", "player", "I keep hearing them at night — the forest cats. Fighting, yowling. Doesn't it make you curious?", {
        holdMs: 3000,
        shot: "close",
        focus: [P],
        cues: [{ who: P, face: "smudge", head: "look", durMs: 3000 }],
      }),
      L("Smudge", "smudge", "Curious? Henry says they fight foxes. I'm curious about dinner, personally.", {
        emotion: "confused",
        holdMs: 3000,
        shot: "medium",
        focus: [P, "smudge"],
        cues: [{ who: "smudge", head: "shake", tail: true, durMs: 3000 }],
      }),
    ],
    choices: [
      {
        label: "I'm going to the edge of the trees. Today.",
        playerLine: "I'm going to the edge of the trees. Today.",
        reply: L("Smudge", "smudge", "You're really going, aren't you? …Come back before the Twolegs lock the cat door.", {
          emotion: "sad",
          holdMs: 3000,
          shot: "close",
          focus: ["smudge"],
          cues: [{ who: "smudge", head: "nod", durMs: 3000 }],
        }),
      },
      {
        label: "Maybe I'll patrol the garden. Again.",
        playerLine: "Maybe I'll patrol the garden. Again.",
        reply: L("Smudge", "smudge", "Good cat. The wildest thing out here is the neighbour's rottweiler anyway.", {
          emotion: "happy",
          holdMs: 2800,
          shot: "medium",
          focus: [P, "smudge"],
          cues: [{ who: "smudge", tail: true, durMs: 2800 }],
        }),
      },
    ],
  },

  "s2-into-forest": {
    id: "s2",
    pair: [P, "graypaw"],
    lines: [
      L("Narrator", "narrator", "The fence gap is exactly where you left it. Beyond it, the grass is wet and the pines stand very tall.", {
        holdMs: 3000,
        shot: "wide",
        focus: [P],
      }),
      L("Narrator", "narrator", "You follow the scent trail north. The garden sounds fall away one by one until there is only wind.", {
        holdMs: 3000,
        shot: "medium",
        focus: [P],
        cues: [{ who: P, head: "look", alert: true, durMs: 3000 }],
      }),
      L("You", "player", "It's so much BIGGER than it looks from the fence.", {
        emotion: "surprised",
        holdMs: 2600,
        shot: "close",
        focus: [P],
        cues: [{ who: P, alert: true, tail: true, durMs: 2600 }],
      }),
      L("Narrator", "narrator", "Somewhere ahead a twig snaps. Something small and quick is moving through the ferns.", {
        holdMs: 2800,
        shot: "wide",
        focus: [P],
        cues: [{ who: P, head: "look", alert: true, durMs: 2800 }],
      }),
    ],
  },

  // §2 — THE FOREST ENCOUNTER: establish, notice, close-ups, two-shots.
  "s3-graypaw": {
    id: "s3",
    pair: [P, "graypaw"],
    lines: [
      L("Narrator", "narrator", "The pine trail narrows. Ferns crowd the path, still shaking where something passed through.", {
        holdMs: 2800,
        shot: "wide",
        focus: [P],
      }),
      L("Narrator", "narrator", "A gray shape bursts out of the bracken — and skids to a stop, staring.", {
        holdMs: 2600,
        shot: "wide",
        focus: [P, "graypaw"],
        cues: [
          { who: "graypaw", step: { toward: P, gap: 58, maxPx: 90 }, alert: true, tail: true, durMs: 2600 },
          { who: P, face: "graypaw", alert: true, durMs: 2600 },
        ],
      }),
      L("Graypaw", "graypaw", "Ha! I knew I smelled kittypet! You should have seen your face — I thought you'd climb a tree!", {
        emotion: "excited",
        holdMs: 3200,
        shot: "close",
        focus: ["graypaw"],
        cues: [{ who: "graypaw", face: P, tail: true, alert: true, durMs: 3200 }],
      }),
      L("You", "player", "You nearly landed on my tail! Is that how forest cats say hello?", {
        emotion: "confused",
        holdMs: 2800,
        shot: "close",
        focus: [P],
        cues: [{ who: P, face: "graypaw", head: "look", alert: true, durMs: 2800 }],
      }),
      L("Graypaw", "graypaw", "Only to kittypets. I'm Graypaw — ThunderClan apprentice, best hunter in the den. What's a house cat doing this deep in the pines?", {
        emotion: "happy",
        holdMs: 3600,
        shot: "two",
        cues: [{ who: "graypaw", step: { toward: P, gap: 46, maxPx: 26 }, tail: true, durMs: 3600 }],
      }),
      L("You", "player", "I wanted to see the forest. I didn't know anyone lived in it.", {
        holdMs: 2600,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "look", durMs: 2600 }],
      }),
      L("Graypaw", "graypaw", "A whole Clan of us. Bluestar leads ThunderClan — she'll want to meet a kittypet brave enough to walk the pines alone. Come on!", {
        emotion: "excited",
        holdMs: 3600,
        shot: "close",
        focus: ["graypaw"],
        cues: [{ who: "graypaw", face: P, tail: true, durMs: 3600 }],
      }),
      L("Narrator", "narrator", "Graypaw turns and trots up the trail, glancing back to make sure you are following.", {
        holdMs: 2800,
        shot: "wide",
        focus: [P, "graypaw"],
        cues: [
          // he turns and takes the first steps up the pine trail, then the
          // escort takes over and the player follows through the world
          { who: "graypaw", face: P, tail: true, step: { offset: { x: 0, y: -36 } }, durMs: 2600 },
          { who: P, face: "graypaw", step: { toward: "graypaw", gap: 70, maxPx: 40 }, durMs: 2800 },
        ],
      }),
    ],
    choices: [
      {
        label: "Show me everything.",
        playerLine: "Show me everything.",
        reply: L("Graypaw", "graypaw", "That's the spirit! Follow me — and try to keep up, forest-slowpoke.", {
          emotion: "happy",
          holdMs: 2600,
          shot: "two",
          cues: [{ who: "graypaw", tail: true, durMs: 2600 }],
        }),
      },
      {
        label: "I should get home before dark…",
        playerLine: "I should get home before dark…",
        reply: L("Graypaw", "graypaw", "Suit yourself. But Bluestar's at camp — and something's happened. Redtail… you'd better come and hear it.", {
          emotion: "sad",
          holdMs: 3200,
          shot: "close",
          focus: ["graypaw"],
          cues: [{ who: "graypaw", head: "shake", durMs: 3200 }],
        }),
      },
    ],
  },

  // §2 — ARRIVAL AT CAMP: wide establishing shots, then close interactions.
  "s4-the-camp": {
    id: "s4",
    openOn: { x: 89 * 32, y: 86 * 32 },
    pair: [P, "graypaw"],
    lines: [
      L("Narrator", "narrator", "The trail drops into a ravine. Gorse closes over your head, and the forest smell changes to many, many cats.", {
        holdMs: 3200,
        shot: "wide",
        focus: [P, "graypaw"],
      }),
      L("Narrator", "narrator", "Graypaw pushes through the tunnel first and waits on the other side, tail up.", {
        holdMs: 2800,
        shot: "wide",
        focus: [P, "graypaw"],
        cues: [{ who: "graypaw", step: { toward: P, gap: 60, maxPx: 200 }, face: P, durMs: 2800 }],
      }),
      L("Narrator", "narrator", "Beyond him: a sandy clearing ringed by bramble. Dens, a fresh-kill pile, cats everywhere — a whole life hidden from every Twoleg.", {
        holdMs: 3600,
        shot: "wide",
        focus: [P, "graypaw"],
      }),
      L("Narrator", "narrator", "On the Tallrock a blue-gray she-cat sits alone. She has been watching the tunnel since you entered it.", {
        holdMs: 3000,
        shot: "close",
        focus: ["bluestar"],
        cues: [{ who: "bluestar", alert: true, head: "look", durMs: 3000 }],
      }),
      L("Graypaw", "graypaw", "Welcome to ThunderClan camp. Keep close — the Clan's grieving. Redtail, our deputy, died at Sunningrocks.", {
        emotion: "sad",
        holdMs: 3600,
        shot: "close",
        focus: ["graypaw"],
        cues: [
          { who: "graypaw", face: P, head: "shake", step: { toward: P, gap: 66, maxPx: 120 }, durMs: 3600 },
        ],
      }),
      L("You", "player", "That's why no one is talking. They're all looking at me.", {
        holdMs: 2800,
        shot: "two",
        cues: [{ who: P, head: "look", alert: true, durMs: 2800 }],
      }),
      L("Graypaw", "graypaw", "They're looking at the stranger who walked in with their apprentice. Don't stare back. Bluestar's coming down.", {
        emotion: "calm",
        holdMs: 3200,
        shot: "two",
        cues: [{ who: "graypaw", face: P, step: { toward: P, gap: 58, maxPx: 120 }, durMs: 3200 }],
      }),
      L("Narrator", "narrator", "The she-cat rises and crosses the clearing. The noise of the camp falls away around her.", {
        holdMs: 3000,
        shot: "medium",
        focus: [P, "bluestar"],
        cues: [{ who: "bluestar", step: { toward: P, gap: 96, maxPx: 120 }, face: P, durMs: 3000 }],
      }),
    ],
  },

  "s5-bluestar": {
    id: "s5",
    pair: [P, "bluestar"],
    lines: [
      L("Bluestar", "bluestar", "So. The kittypet who crossed our border with his tail up like a warrior.", {
        emotion: "calm",
        holdMs: 3200,
        shot: "close",
        focus: ["bluestar"],
        cues: [{ who: "bluestar", face: P, tail: true, durMs: 3200 }],
      }),
      L("You", "player", "I didn't mean to trespass. I didn't know the forest belonged to anyone.", {
        holdMs: 2800,
        shot: "close",
        focus: [P],
        cues: [{ who: P, face: "bluestar", durMs: 2800 }],
      }),
      L("Bluestar", "bluestar", "It belongs to ThunderClan — every leaf. And yet StarClan sent me a sign of fire, and fire walked into my camp wearing a Twoleg collar.", {
        emotion: "firm",
        holdMs: 3800,
        shot: "close",
        focus: ["bluestar"],
        cues: [{ who: "bluestar", head: "nod", durMs: 3800 }],
      }),
      L("You", "player", "Fire? I'm not — I'm just a house cat.", {
        emotion: "confused",
        holdMs: 2600,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "shake", alert: true, durMs: 2600 }],
      }),
      L("Bluestar", "bluestar", "Fire alone can save our Clan. Join us, and the Clan will test you — as is right. Refuse, and go home to your Twolegs.", {
        emotion: "firm",
        holdMs: 3800,
        shot: "medium",
        focus: [P, "bluestar"],
        cues: [{ who: "bluestar", step: { toward: P, gap: 84, maxPx: 30 }, durMs: 3800 }],
      }),
    ],
    choices: [
      {
        label: "Then I'm yours to test, Bluestar.",
        playerLine: "Then I'm yours to test, Bluestar.",
        reply: L("Bluestar", "bluestar", "Then stay, and be welcome. Lionheart will look at you properly — and StarClan will watch what you make of yourself.", {
          emotion: "happy",
          holdMs: 3400,
          shot: "close",
          focus: ["bluestar"],
          cues: [{ who: "bluestar", tail: true, head: "nod", durMs: 3400 }],
        }),
      },
      {
        label: "I need to think about it.",
        playerLine: "I need to think about it.",
        reply: L("Bluestar", "bluestar", "Think quickly. The forest does not wait, and neither does the shadow gathering beyond our borders.", {
          emotion: "calm",
          holdMs: 3000,
          shot: "close",
          focus: ["bluestar"],
          cues: [{ who: "bluestar", head: "look", durMs: 3000 }],
        }),
      },
    ],
  },

  "s6-test-lionheart": {
    id: "s6",
    pair: [P, "lionheart"],
    lines: [
      L("Narrator", "narrator", "Lionheart circles you in the clearing, paws soft, golden eyes never leaving your shoulders.", {
        holdMs: 3000,
        shot: "medium",
        focus: [P, "lionheart"],
        cues: [
          { who: "lionheart", step: { toward: P, gap: 92, maxPx: 56 }, face: P, durMs: 3000 },
          { who: P, face: "lionheart", alert: true, durMs: 3000 },
        ],
      }),
      L("Lionheart", "lionheart", "A Clanmate who flinches at shadows is worse than no Clanmate at all. Show me you can hold your ground.", {
        emotion: "firm",
        holdMs: 3200,
        shot: "close",
        focus: ["lionheart"],
        cues: [{ who: "lionheart", alert: true, head: "nod", durMs: 3200 }],
      }),
      L("You", "player", "I won't flinch. I've faced the garden vacuum.", {
        emotion: "excited",
        holdMs: 2600,
        shot: "close",
        focus: [P],
        cues: [{ who: P, pose: "crouch", tail: true, durMs: 2600 }],
      }),
      L("Lionheart", "lionheart", "Ha! You didn't run from Graypaw's ambush either. Dawn, then — your apprenticeship begins, if StarClan wills it.", {
        emotion: "happy",
        holdMs: 3400,
        shot: "medium",
        focus: [P, "lionheart"],
        cues: [{ who: "lionheart", tail: true, head: "nod", durMs: 3400 }],
      }),
    ],
  },

  "s7-firepaw": {
    id: "s7",
    pair: [P, "spottedleaf"],
    lines: [
      L("Narrator", "narrator", "Moonhigh. The Clan gathers beneath the Tallrock, and the clearing smells of crushed fern and cold air.", {
        holdMs: 3000,
        shot: "wide",
        focus: [P],
      }),
      L("Spottedleaf", "spottedleaf", "Welcome, little flame. I dreamed of fire among the bracken — and tonight the dream has a name.", {
        emotion: "calm",
        holdMs: 3400,
        shot: "close",
        focus: ["spottedleaf"],
        cues: [{ who: "spottedleaf", face: P, tail: true, durMs: 3400 }],
      }),
      L("You", "player", "A name? I already have one… don't I?", {
        emotion: "confused",
        holdMs: 2400,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "look", durMs: 2400 }],
      }),
      L("Spottedleaf", "spottedleaf", "An apprentice name. Rusty received his tonight too — Firepaw. Learn well, and ThunderClan will be glad of you both.", {
        emotion: "happy",
        holdMs: 3600,
        shot: "medium",
        focus: [P, "spottedleaf"],
        cues: [{ who: "spottedleaf", head: "nod", durMs: 3600 }],
      }),
      L("Narrator", "narrator", "The Clan calls the new names into the dark, and the stars over the ravine seem very close.", {
        holdMs: 2800,
        shot: "wide",
        focus: [P],
      }),
    ],
  },

  "s8-hunt-first": {
    id: "s8",
    pair: [P, "graypaw"],
    lines: [
      L("Graypaw", "graypaw", "An apprentice hunts for the Clan before feeding itself — that's the warrior code. Watch me, then copy it exactly.", {
        emotion: "firm",
        holdMs: 3400,
        shot: "close",
        focus: ["graypaw"],
        cues: [{ who: "graypaw", face: P, head: "nod", durMs: 3400 }],
      }),
      L("Graypaw", "graypaw", "Crouch low. Tail still. Mind the leaves — a mouse hears a leaf the way you hear a Twoleg door.", {
        emotion: "calm",
        holdMs: 3400,
        shot: "medium",
        focus: ["graypaw"],
        cues: [{ who: "graypaw", pose: "crouch", step: { toward: P, gap: 120, maxPx: 40 }, durMs: 3400 }],
      }),
      L("You", "player", "And then?", {
        holdMs: 2000,
        shot: "close",
        focus: [P],
        cues: [{ who: P, pose: "crouch", durMs: 2000 }],
      }),
      L("Graypaw", "graypaw", "Then you POUNCE — like this! …That one got away. Don't tell anyone.", {
        emotion: "excited",
        holdMs: 3000,
        shot: "medium",
        focus: ["graypaw"],
        cues: [{ who: "graypaw", pose: "pounce", alert: true, tail: true, durMs: 3000 }],
      }),
    ],
  },

  "s9-training": {
    id: "s9",
    pair: [P, "whitestorm"],
    lines: [
      L("Whitestorm", "whitestorm", "Welcome to the Sandy Hollow, where ThunderClan hones its claws. Stand there and show me what StarClan gave you.", {
        emotion: "calm",
        holdMs: 3400,
        shot: "close",
        focus: ["whitestorm"],
        cues: [{ who: "whitestorm", face: P, step: { toward: P, gap: 100, maxPx: 50 }, durMs: 3400 }],
      }),
      L("Whitestorm", "whitestorm", "The crouch. The pounce. The belly rake. Again — and this time keep your tail off the sand.", {
        emotion: "firm",
        holdMs: 3200,
        shot: "medium",
        focus: [P, "whitestorm"],
        cues: [{ who: "whitestorm", pose: "crouch", head: "nod", durMs: 3200 }],
      }),
      L("You", "player", "I've been waiting for this since the fence.", {
        emotion: "firm",
        holdMs: 2400,
        shot: "close",
        focus: [P],
        cues: [{ who: P, pose: "crouch", tail: true, durMs: 2400 }],
      }),
      L("Whitestorm", "whitestorm", "Good. A warrior's first weapon is patience — and you will need both before this leaf-bare is out.", {
        emotion: "calm",
        holdMs: 3400,
        shot: "two",
        cues: [{ who: "whitestorm", head: "nod", tail: true, durMs: 3400 }],
      }),
    ],
  },

  "s10-border-patrol": {
    id: "s10",
    pair: [P, "lionheart"],
    lines: [
      L("Narrator", "narrator", "The patrol walks west with the sun on its shoulders, following the scent line toward the river.", {
        holdMs: 3000,
        shot: "wide",
        focus: [P, "lionheart"],
      }),
      L("Lionheart", "lionheart", "The border is renewed every sun-high. Walk it with me, and remember: this line has bled before.", {
        emotion: "calm",
        holdMs: 3200,
        shot: "close",
        focus: ["lionheart"],
        cues: [{ who: "lionheart", face: P, durMs: 3200 }],
      }),
      L("You", "player", "Redtail died here, didn't he?", {
        holdMs: 2400,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "look", durMs: 2400 }],
      }),
      L("Lionheart", "lionheart", "On the stones at Sunningrocks, holding this ground against RiverClan. Stay alert, apprentice — grief is not the same as peace.", {
        emotion: "firm",
        holdMs: 3400,
        shot: "medium",
        focus: [P, "lionheart"],
        cues: [{ who: "lionheart", alert: true, head: "look", durMs: 3400 }],
      }),
    ],
  },

  "s11-riverclan": {
    id: "s11",
    pair: [P, "oakheart"],
    lines: [
      L("Narrator", "narrator", "At the stepping stones the water is loud. Across it, a RiverClan warrior is already watching.", {
        holdMs: 3000,
        shot: "wide",
        focus: [P, "oakheart"],
      }),
      L("Oakheart", "oakheart", "Well, well. Bluestar takes strays from the Twoleg gardens now, does she?", {
        emotion: "calm",
        holdMs: 3000,
        shot: "close",
        focus: ["oakheart"],
        cues: [{ who: "oakheart", face: P, tail: true, durMs: 3000 }],
      }),
      L("You", "player", "I'm ThunderClan. The river is yours — we only walk the bank.", {
        emotion: "firm",
        holdMs: 2800,
        shot: "close",
        focus: [P],
        cues: [{ who: P, face: "oakheart", durMs: 2800 }],
      }),
      L("Oakheart", "oakheart", "Mrrrow. The river keeps RiverClan strong. The question is what keeps ThunderClan strong these days.", {
        emotion: "calm",
        holdMs: 3200,
        shot: "medium",
        focus: [P, "oakheart"],
        cues: [{ who: "oakheart", head: "look", tail: true, durMs: 3200 }],
      }),
    ],
  },

  "s12-shadowclan-scent": {
    id: "s12",
    pair: [P, "yellowfang"],
    lines: [
      L("Narrator", "narrator", "Snakerocks smells of old stone and older anger. Something is curled in the shadows between the boulders.", {
        holdMs: 3000,
        shot: "medium",
        focus: [P],
        cues: [{ who: P, alert: true, head: "sniff", durMs: 3000 }],
      }),
      L("Yellowfang", "yellowfang", "Trespassing apprentice! Haven't you been taught to leave a sick old she-cat in peace?", {
        emotion: "angry",
        holdMs: 3200,
        shot: "close",
        focus: ["yellowfang"],
        cues: [{ who: "yellowfang", step: { toward: P, gap: 92, maxPx: 50 }, alert: true, face: P, durMs: 3200 }],
      }),
      L("You", "player", "You're ThunderClan's missing medicine cat. The whole forest is looking for you.", {
        emotion: "confused",
        holdMs: 2800,
        shot: "close",
        focus: [P],
        cues: [{ who: P, face: "yellowfang", head: "look", durMs: 2800 }],
      }),
      L("Yellowfang", "yellowfang", "Then let it keep looking. Tell no one you found me. And stay away from Tigerclaw, kit — he smells stories everywhere.", {
        emotion: "sad",
        holdMs: 3800,
        shot: "medium",
        focus: [P, "yellowfang"],
        cues: [{ who: "yellowfang", head: "shake", tail: true, durMs: 3800 }],
      }),
    ],
  },

  "s13-windclan-moor": {
    id: "s13",
    pair: [P, "tallstar"],
    lines: [
      L("Narrator", "narrator", "The moor opens like a held breath. Wind combs the grass flat, and the sky is far too large.", {
        holdMs: 3000,
        shot: "wide",
        focus: [P, "tallstar"],
      }),
      L("Tallstar", "tallstar", "A ThunderClan cat on my moor — and bold enough to walk up and say hello! You have sharp eyes, young one.", {
        emotion: "happy",
        holdMs: 3400,
        shot: "close",
        focus: ["tallstar"],
        cues: [{ who: "tallstar", face: P, tail: true, durMs: 3400 }],
      }),
      L("You", "player", "The Clans say WindClan's prey is being stolen. Is it true?", {
        emotion: "confused",
        holdMs: 2800,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "look", durMs: 2800 }],
      }),
      L("Tallstar", "tallstar", "Run with us once across the open grass, and your legs will never forget it. Then we shall talk of thieves and borders.", {
        emotion: "calm",
        holdMs: 3400,
        shot: "medium",
        focus: [P, "tallstar"],
        cues: [{ who: "tallstar", head: "nod", tail: true, durMs: 3400 }],
      }),
    ],
  },

  "s14-gathering": {
    id: "s14",
    pair: [P, "bluestar"],
    lines: [
      L("Narrator", "narrator", "Full moon over Fourtrees. Four great oaks, four Clans, and a truce as old as the forest itself.", {
        holdMs: 3200,
        shot: "wide",
        focus: [P],
      }),
      L("Bluestar", "bluestar", "Cats of all Clans — ThunderClan is proud to present its newest apprentices. Though ShadowClan's shadow grows, the truce of the full moon holds.", {
        emotion: "calm",
        holdMs: 3800,
        shot: "medium",
        focus: ["bluestar"],
        cues: [{ who: "bluestar", head: "nod", tail: true, durMs: 3800 }],
      }),
      L("You", "player", "So MANY cats… and for one night, peace.", {
        emotion: "happy",
        holdMs: 2600,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "look", tail: true, durMs: 2600 }],
      }),
      L("Narrator", "narrator", "Across the clearing, Brokenstar's warriors keep to the shadows — and watch ThunderClan's new apprentices a little too closely.", {
        holdMs: 3000,
        shot: "wide",
        focus: [P, "bluestar"],
      }),
    ],
  },

  "s15-moonstone": {
    id: "s15",
    pair: [P, "bluestar"],
    lines: [
      L("Narrator", "narrator", "Highstones. Mothermouth. The cave breathes cold air over your paws and swallows the moonlight behind you.", {
        holdMs: 3200,
        shot: "wide",
        focus: [P],
      }),
      L("Narrator", "narrator", "Deep inside, something glows like a caged star. The Moonstone.", {
        holdMs: 2800,
        shot: "medium",
        focus: [P],
      }),
      L("You", "player", "StarClan… I'm listening.", {
        emotion: "calm",
        holdMs: 2600,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "look", pose: "sit", durMs: 2600 }],
      }),
      L("Narrator", "narrator", "In the stone's light you see them — warriors of starlight, watching. Beside you, Firepaw's eyes shine with the same fire you feel.", {
        emotion: "calm",
        holdMs: 3600,
        shot: "wide",
        focus: [P],
      }),
    ],
  },

  "s16-final-battle": {
    id: "s16",
    pair: [P, "ravenpaw"],
    lines: [
      L("Narrator", "narrator", "ShadowClan pours over the border! The patrol lines meet on the wet stones of Sunningrocks — this is what you trained for.", {
        emotion: "firm",
        holdMs: 3400,
        shot: "wide",
        focus: [P, "lionheart"],
      }),
      L("You", "player", "For ThunderClan!", {
        emotion: "excited",
        holdMs: 2200,
        shot: "close",
        focus: [P],
        cues: [{ who: P, pose: "pounce", alert: true, durMs: 2200 }],
      }),
      L("Narrator", "narrator", "When the fighting breaks, Ravenpaw is crouched behind the rocks, shaking. He waits until the warriors are out of earshot.", {
        holdMs: 3200,
        shot: "medium",
        focus: [P, "ravenpaw"],
        cues: [{ who: "ravenpaw", step: { toward: P, gap: 70, maxPx: 40 }, face: P, alert: true, durMs: 3200 }],
      }),
      L("Ravenpaw", "ravenpaw", "You fought well. Braver than me. Listen — before Tigerclaw finds us — I was THERE when Redtail died. It wasn't Oakheart. I saw TIGERCLAW.", {
        emotion: "scared",
        holdMs: 4200,
        shot: "close",
        focus: ["ravenpaw"],
        cues: [{ who: "ravenpaw", head: "shake", alert: true, durMs: 4200 }],
      }),
      L("You", "player", "Tigerclaw… the deputy?", {
        emotion: "surprised",
        holdMs: 2400,
        shot: "close",
        focus: [P],
        cues: [{ who: P, alert: true, head: "look", durMs: 2400 }],
      }),
    ],
    choices: [
      {
        label: "Your secret is safe with me.",
        playerLine: "Your secret is safe with me.",
        reply: L("Ravenpaw", "ravenpaw", "Thank you. Just… be careful, friend. Some shadows have long claws.", {
          emotion: "sad",
          holdMs: 2800,
          shot: "close",
          focus: ["ravenpaw"],
          cues: [{ who: "ravenpaw", head: "nod", durMs: 2800 }],
        }),
      },
      {
        label: "The Clan must hear the truth.",
        playerLine: "The Clan must hear the truth.",
        reply: L("Ravenpaw", "ravenpaw", "And who would BELIEVE an apprentice over a senior warrior? Think, friend. Think carefully.", {
          emotion: "angry",
          holdMs: 3000,
          shot: "close",
          focus: ["ravenpaw"],
          cues: [{ who: "ravenpaw", head: "shake", durMs: 3000 }],
        }),
      },
    ],
  },

  "s17-epilogue": {
    id: "s17",
    pair: [P, "graypaw"],
    lines: [
      L("Narrator", "narrator", "Night settles over the ravine. The fresh-kill pile is full, the dens are warm, and the Clan is quiet at last.", {
        holdMs: 3000,
        shot: "wide",
        focus: [P, "graypaw"],
      }),
      L("Graypaw", "graypaw", "Here — the best spot on the pile is yours tonight. You earned it, forest-slowpoke.", {
        emotion: "happy",
        holdMs: 3000,
        shot: "close",
        focus: ["graypaw"],
        cues: [{ who: "graypaw", face: P, tail: true, durMs: 3000 }],
      }),
      L("You", "player", "A moon ago I was staring over a garden fence. Now I have a Clan.", {
        emotion: "happy",
        holdMs: 2800,
        shot: "close",
        focus: [P],
        cues: [{ who: P, head: "look", tail: true, durMs: 2800 }],
      }),
      L("Graypaw", "graypaw", "You're Clan now. Whatever comes next — ShadowClan, leaf-bare, all of it — we face it together.", {
        emotion: "firm",
        holdMs: 3200,
        shot: "two",
        cues: [{ who: "graypaw", head: "nod", durMs: 3200 }],
      }),
      L("Narrator", "narrator", "Under Silverpelt the Clan sleeps. Your fire is only beginning — and the forest's story is far from over.", {
        emotion: "calm",
        holdMs: 3600,
        shot: "wide",
        focus: [P],
      }),
    ],
  },
};

/** §STORY-ONE-BOX: read-time pacing for a line — long enough to read, short
 *  enough that the player is never trapped (§36). */
export function lineReadMs(text: string): number {
  return Math.min(9000, Math.max(2200, 1900 + text.length * 45));
}

/**
 * §CINEMATIC: the shot a line calls for.
 *
 * Close-ups do the emotional work (a speaker, a reaction), two-shots carry the
 * interaction, and the wide shot establishes the place. A line can override
 * either half explicitly; otherwise the speaker decides.
 */
export function lineCameraShot(line: CineLine, beat: StoryBeat): { shot: CineShot; actors: string[] } {
  const pair = beat.pair ? ([...beat.pair] as string[]) : [];
  const fromCam =
    line.cam && "npcId" in line.cam ? [line.cam.npcId] : line.cam && "player" in line.cam ? ["player"] : null;
  const focus = line.focus?.length ? [...line.focus] : fromCam;

  if (line.shot === "two") return { shot: "two", actors: focus ?? pair };
  if (focus) return { shot: line.shot ?? "close", actors: focus };
  if (line.shot) {
    if (line.shot === "wide") return { shot: "wide", actors: pair };
    return { shot: line.shot, actors: [line.speakerId === "narrator" ? "player" : line.speakerId] };
  }
  if (line.speakerId === "narrator") return { shot: "wide", actors: pair.length ? pair : ["player"] };
  if (line.speakerId === "player") return { shot: "close", actors: ["player"] };
  return { shot: "close", actors: [line.speakerId] };
}

/**
 * §CINEMATIC: the acting a line performs.
 *
 * Authored cues run first; then the defaults that make a conversation read as
 * one: whoever is speaking moves their mouth, and whoever is listening turns
 * toward them. Nothing is faked by sliding a whole sprite — these are the
 * engine's real pose / head / tail / ear / step states.
 */
export function actingForLine(line: CineLine, beat: StoryBeat): CineCue[] {
  const out = (line.cues ?? []).map((c) => ({ ...c }));
  const has = (who: string) => out.some((c) => c.who === who);
  const speaker = line.speakerId;
  if (speaker !== "narrator") {
    if (has(speaker)) {
      for (const c of out) if (c.who === speaker && c.talking === undefined) c.talking = true;
    } else out.push({ who: speaker, talking: true });
  }
  // listeners turn toward the speaker — natural, live-resolved, never a snap
  if (speaker !== "narrator" && beat.pair) {
    for (const who of beat.pair) {
      if (who === speaker || has(who)) continue;
      out.push({ who, face: speaker });
    }
  }
  return out;
}

export interface ResolvedCue {
  who: string;
  face?: { x: number; y: number };
  stepTo?: { x: number; y: number };
  pose?: CatPose;
  head?: "nod" | "shake" | "look" | "sniff";
  tail?: boolean;
  alert?: boolean;
  talking?: boolean;
  durMs: number;
}

/**
 * §CINEMATIC: turn an authored cue into concrete world directions.
 *
 * Pure on purpose: the scene player and the verification suite resolve cues
 * the same way, and the step is a real destination on the ground (current
 * position + travel toward the target, stopping `gap` short), never a
 * whole-sprite slide or a teleport.
 */
export function resolveCue(
  cue: CineCue,
  posOf: (id: string) => { x: number; y: number } | null,
  durMs: number,
): ResolvedCue {
  const face = typeof cue.face === "string" ? posOf(cue.face) : null;
  let stepTo: { x: number; y: number } | undefined;
  if (cue.step) {
    const owner = posOf(cue.who);
    if (owner && cue.step.offset) {
      // a directed walk in a direction (turn and head up the trail)
      const off = cue.step.offset;
      const d = Math.hypot(off.x, off.y);
      const travel = Math.min(d, cue.step.maxPx ?? d);
      if (travel > 2) stepTo = { x: owner.x + (off.x / d) * travel, y: owner.y + (off.y / d) * travel };
    } else if (owner && cue.step.toward) {
      const target = posOf(cue.step.toward);
      if (target) {
        const dx = target.x - owner.x;
        const dy = target.y - owner.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
          const travel = Math.min(Math.max(0, d - (cue.step.gap ?? 60)), cue.step.maxPx ?? 40);
          if (travel > 2) stepTo = { x: owner.x + (dx / d) * travel, y: owner.y + (dy / d) * travel };
        }
      }
    }
  }
  return {
    who: cue.who,
    face: face ?? undefined,
    stepTo,
    pose: cue.pose,
    head: cue.head,
    tail: cue.tail,
    alert: cue.alert,
    talking: cue.talking,
    durMs,
  };
}

/**
 * §STORY-ONE-BOX: the script for an E-interaction in Story Mode.
 *
 * A story talk is ONE authored exchange, played by ONE dialogue box: the
 * scene's narration opens it, the cat answers in their own voice, and the
 * step's resolution (the cat or the narrator) closes it. Building the lines as
 * data keeps the narrator turn and the character turn in the same sequence —
 * there is no second panel and nothing to stack.
 */
export function composeStoryTalk(opts: {
  npc: { id: string; name: string };
  /** in-character opening from the dialogue engine */
  opening: string;
  /** scene narration; omitted when the player talks to a bystander */
  brief?: string;
  /** the step's onComplete lines (already resolved) */
  completion?: { speaker: string; text: string }[];
  /** name → vocal profile id (defaults are enough for tests/narrator) */
  speakerIdFor?: (speaker: string) => string;
  readMs?: (text: string) => number;
}): StoryBeat {
  const speakerIdFor =
    opts.speakerIdFor ??
    ((speaker: string) =>
      speaker === "Narrator" ? "narrator" : speaker === "You" ? "player" : speaker.toLowerCase());
  const readMs = opts.readMs ?? lineReadMs;

  const lines: CineLine[] = [];
  const lead = opts.brief?.trim();
  if (lead) {
    lines.push({
      speaker: "Narrator",
      speakerId: "narrator",
      text: lead,
      holdMs: readMs(lead),
      shot: "wide",
      focus: ["player", opts.npc.id],
    });
  }
  lines.push({
    speaker: opts.npc.name,
    speakerId: opts.npc.id,
    text: opts.opening,
    holdMs: readMs(opts.opening),
    shot: "close",
    focus: [opts.npc.id],
    act: { npcId: opts.npc.id, lookAt: "player" },
    cues: [{ who: opts.npc.id, face: "player", tail: true, durMs: readMs(opts.opening) }],
  });
  for (const l of opts.completion ?? []) {
    const id = speakerIdFor(l.speaker);
    lines.push({
      speaker: l.speaker,
      speakerId: id,
      text: l.text,
      holdMs: readMs(l.text),
      shot: id === "narrator" ? "two" : "close",
      ...(id === "narrator" ? {} : { focus: [id === "player" ? "player" : id] }),
    });
  }
  return { id: `talk:${opts.npc.id}`, lines, pair: ["player", opts.npc.id] };
}

/**
 * §3: timeline choreography for callers that want a fully pre-queued camera
 * (kept for scripted sequences outside the shot director). The per-line
 * framing used by Story Mode lives in `lineCameraShot` and is applied live.
 */
export function beatCameraSteps(
  beat: StoryBeat,
  npcPos: (id: string) => { x: number; y: number } | null,
  playerPos: { x: number; y: number },
  sceneAt?: { x: number; y: number } | null,
): CineStep[] {
  const steps: CineStep[] = [];
  const start = beat.openOn ?? sceneAt ?? playerPos;
  steps.push({ kind: "pan", target: start, durMs: 900, ease: "inout" });
  for (const line of beat.lines) {
    const plan = lineCameraShot(line, beat);
    const p =
      plan.actors.length > 0
        ? plan.actors
            .map((id) => (id === "player" ? playerPos : npcPos(id)))
            .filter((v): v is { x: number; y: number } => Boolean(v))
        : [];
    if (p.length > 0) {
      steps.push({
        kind: "pan",
        target: {
          x: p.reduce((a, v) => a + v.x, 0) / p.length,
          y: p.reduce((a, v) => a + v.y, 0) / p.length,
        },
        durMs: 1100,
        ease: "inout",
      });
    }
    if (line.zoom !== undefined) steps.push({ kind: "zoom", zoom: line.zoom, durMs: 700, ease: "out" });
  }
  steps.push({ kind: "followPlayer", durMs: 600 });
  steps.push({ kind: "zoom", zoom: 1, durMs: 600, ease: "out" });
  return steps;
}
