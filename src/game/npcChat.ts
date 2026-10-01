// WarriorCatsRPG — character AI chat: in-character responses + ask menus.
//
// TWO LAYERS, ONE VOICE:
//  1. ASK MENUS — 3–5 short, context-valid questions per NPC, filtered by
//     knowledge, Clan, rank and the Into the Wild timeline step.
//  2. TALK CHAT — the player types freely; the message is classified into a
//     topic, checked against THIS cat's knowledge (per-NPC, learned flags
//     included) and the timeline, then answered in the cat's own voice with
//     stance-matched replies. No OOC, no narrator, no future knowledge.
//
// Everything is deterministic and offline-safe; the optional Convex AI action
// (npcAi, used only when a key is configured) receives the same profile pack
// and may REPLACE the local reply, so behavior is identical with or without it.

import { profileFor, type CharacterProfile } from "./characters";
import { knows, starClanReply, type DialogueContext } from "./dialogue";
import {
  identityActivity, identityAge, identityClan, identityFamily, identityFriends,
  identityLeader, identityMentor, identityName, identityRank, opinionOf,
  relationTo, type Relation,
} from "./npcChatIdentity";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One selectable question in the "Ask [name]" submenu. */
export interface AskOption {
  id: string;
  /** Short question text shown on the button. */
  label: string;
  /** Selection priority (higher first). */
  weight?: number;
  /** The NPC's in-character answer. */
  reply: string;
  /** Side effects, mirroring the dialogue choice system. */
  effect?: "bond" | "learn" | "end";
  learn?: string;
}

/** A compact chat exchange inside the "Talk to [name]" panel. */
export interface ChatMsg {
  from: "player" | "npc";
  text: string;
}

// ---------------------------------------------------------------------------
// Topic classification (fast keyword buckets, no AI needed)
// ---------------------------------------------------------------------------

type Topic =
  | "starclan" | "clan" | "code" | "patrol" | "prey" | "training"
  | "herbs" | "territory" | "weather" | "leaders" | "redtail"
  | "sunningrocks" | "shadowclan" | "twolegs" | "kittypet-life"
  | "player" | "greeting" | "smalltalk" | "gossip" | "unknown"
  | "identity-name" | "identity-age" | "identity-rank" | "identity-leader"
  | "identity-mentor" | "identity-family" | "identity-friends"
  | "identity-activity" | "opinion";

/** Topic classifier table (exported for test suites). */
export const TOPIC_WORDS: [Topic, RegExp][] = [
  ["opinion", /what do you think about|what do you think of|do you like (graypaw|ravenpaw|bluestar|tigerclaw|firepaw|dustpaw|sandpaw|yellowfang|smudge|princess|barley|lionheart|whitestorm|spottedleaf|longtail|darkstripe|redtail|oakheart)|is (graypaw|ravenpaw|bluestar|tigerclaw|firepaw|dustpaw|sandpaw|yellowfang|smudge) (nice|good|bad|strong|brave|your friend)/i],
  ["identity-name", /your name|who are you|what are you called|what.?s my name again|what do cats call you|warrior name|another name|used to be called|were you named/i],
  ["identity-age", /how old|your age|what age|how many moons|how long have you been|been a warrior for|when were you born/i],
  ["identity-rank", /your rank|what.?s your job|what do you do for the (clan|clan for)|your role|what.?s your duty/i],
  ["identity-leader", /who.?s your leader|who is your leader|who leads|who.?s in charge|your leader/i],
  ["identity-mentor", /who trained you|your mentor|who.?s your mentor|who do you mentor|who.?s your apprentice|did you have a mentor/i],
  ["identity-family", /your family|your kin|your mother|your father|your parents|your siblings|your kits|family\?/i],
  ["identity-friends", /your friends|who are your friends|who do you hang|any friends|who.?s your friend|got friends/i],
  ["identity-activity", /what were you doing|what are you doing|where are you going|why are you here|busy/i],
  // deliberately AFTER the Clan/Clan-news topics: "What's happening in the
  // Clan?" must reach the rank-shaped Clan answers, not the activity pool
  // (NOTE: no bare "what happened" here — it would swallow event questions
  // like "What happened at Sunningrocks?" before the timeline gates see them)
  ["gossip", /what.?s happening|any news|anything happened|latest happenings/i],
  ["starclan", /starclan|star clan|silverpelt|ancestors|sky\W*cats|dead cats|heaven/i],
  ["redtail", /redtail|red tail|deputy.*dead|who.*deputy/i],
  ["sunningrocks", /sunningrocks|sunning rocks|the battle|battle.*rocks/i],
  ["shadowclan", /shadowclan|shadow clan|brokenstar|yellowfang.*clan|pine/i],
  ["code", /warrior code|the code|code says|break.*code/i],
  ["patrol", /patrol|border|marker|dawn patrol|border patrol/i],
  ["prey", /prey|hunt|mouse|rabbit|squirrel|fresh-?kill|starving|food|eat/i],
  ["training", /train|apprentice|mentor|battle move|pounce|crouch|spar/i],
  ["herbs", /herb|marigold|cobweb|poppy|heal|wound|sick|injur|medicine/i],
  ["territory", /territor|fourtrees|thunderpath|great sycamore|owl tree|snakerocks|tallpines|map|where am i/i],
  ["weather", /weather|rain|snow|storm|wind|fog|cold|leaf-?bare|green-?leaf/i],
  ["leaders", /bluestar|leader|crookedstar|tallstar|brokenstar|nine lives/i],
  ["twolegs", /twoleg|human|monster|thunderpath.*monster|cage/i],
  ["kittypet-life", /kittypet|house ?cat|twolegplace|fence|bowl|pellets|pet/i],
  ["player", /my (name|clan|story|mother|father)|who am i|firepaw|rusty\b/i],
  ["clan", /clan|thunderclan|riverclan|windclan|camp|ceremony|gathering/i],
  ["gossip", /heard any|rumor|rumour|gossip|what.?s happening|any news|anything happened|latest happenings/i],
  ["greeting", /^(hi|hello|hey|greetings|good (morning|evening|day))\b/i],
  ["smalltalk", /how are you|what.?s up|nice day|feeling/i],
];

function classifyTopic(text: string): Topic {
  for (const [topic, re] of TOPIC_WORDS) if (re.test(text)) return topic;
  return "unknown";
}

// ---------------------------------------------------------------------------
// Knowledge gating: what is this cat ALLOWED to discuss?
// ---------------------------------------------------------------------------

/** Topics a cat without the flag simply cannot answer in-world. */
const FLAG_FOR_TOPIC: Partial<Record<Topic, string>> = {
  starclan: "starclan",
  code: "warrior-code",
  herbs: "clan-life",
};

/** Timeline guards: topics locked before specific story steps (Story Mode). */
const TOPIC_LOCK_STEP: Partial<Record<Topic, number>> = {
  redtail: 1, // Redtail dies between steps 1 and 2
  sunningrocks: 10, // the truth surfaces around Ravenpaw's reveal (step 15)
};

function topicAllowed(topic: Topic, p: CharacterProfile, ctx: DialogueContext): { ok: boolean; why?: "knowledge" | "timeline" } {
  const flag = FLAG_FOR_TOPIC[topic];
  if (flag && !knows(p, flag as never, ctx)) return { ok: false, why: "knowledge" };
  const lock = TOPIC_LOCK_STEP[topic];
  if (ctx.mode === "story" && lock !== undefined && ctx.storyStep < lock) return { ok: false, why: "timeline" };
  // private ThunderClan matters stay private from outsiders (unless told)
  const privateClanTopics: Topic[] = ["redtail", "sunningrocks", "leaders"];
  if (privateClanTopics.includes(topic) && p.clan !== ctx.player.clan && p.clan !== "kittypet") {
    return { ok: false, why: "knowledge" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Voice: stance- and character-shaped reply pools
// ---------------------------------------------------------------------------

const DONT_KNOW: Record<string, string[]> = {
  warm: ["I don't know, honestly. You could try asking somecat else.", "Hmm — that's beyond my whiskers, friend."],
  curious: ["I've no idea. Why do you ask?", "Never heard of it. Should I have?"],
  wary: ["I don't know. And I don't like questions I can't answer.", "That's none of my knowing."],
  hostile: ["I don't know. Stop wasting my daylight.", "Ask some cat who cares."],
  gruff: ["How should I know? My knees know rain, nothing else.", "Don't ask me. I wasn't there, and I'm glad of it."],
};

const REFUSALS: Record<string, string[]> = {
  warm: ["I'd rather not talk about that.", "Not here — ask me another time."],
  curious: ["I... can't talk about that. Sorry.", "You should ask somecat older than me."],
  wary: ["I don't talk about that. To anyone.", "Careful. Some topics cost more than they're worth."],
  hostile: ["You don't get to ask me that.", "Wrong cat. Wrong question."],
  gruff: ["Hmph. I don't speak of that.", "Dead subjects stay buried. Move along."],
};

const FUTURE_DEFLECTION: Record<string, string[]> = {
  warm: ["Who can say what tomorrow brings? The prey runs today — that's enough.", "I don't divine the future. I hunt in it, same as you."],
  curious: ["How would I know THAT? I can barely predict breakfast.", "No cat can know that. Not even the leader."],
  wary: ["No cat knows what hasn't happened. Stop poking at shadows.", "The future isn't yours to dig up. Or mine."],
  hostile: ["I don't play fortune-teller. Fight me or move on.", "The future? Nonsense. The now is trouble enough."],
  gruff: ["I've survived many moons by NOT guessing tomorrow. Keep it that way.", "Only fools and kit-stories claim to know the future."],
};

function pick<T>(arr: T[], seed: number): T {
  if (arr.length === 0) return undefined as unknown as T;
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seedFor(p: CharacterProfile, msg: string, ctx: DialogueContext): number {
  return hashStr(p.id + "|" + msg.toLowerCase().trim()) + (ctx.talked?.[p.id] ?? 0) * 7 + Math.floor(ctx.hour / 4);
}

/**
 * Conversation memory: detect facts the player just TOLD this cat and return
 * the fact id ("i-am-training", "i-am-new", …) to persist per-NPC.
 */
export function detectPlayerFact(msg: string): string | null {
  const m = msg.toLowerCase();
  if (/\b(i'?m|i am) (training|an apprentice)\b/.test(m)) return "i-am-training";
  if (/\bnew (here|to the (clan|forest))\b|\bjust (joined|arrived)\b/.test(m)) return "i-am-new";
  if (/\b(i'?m|i am) (a )?kittypet\b|\bi (used to be|was) a kittypet\b/.test(m)) return "i-was-kittypet";
  if (/\b(i'?m|i am) (a )?warrior\b/.test(m)) return "i-am-warrior";
  if (/\b(i'?m|i am) (a )?medicine (cat|apprentice)\b/.test(m)) return "i-am-medicine";
  if (/\b(i'?m|i am) (a )?(loner|rogue)\b/.test(m)) return "i-am-loner";
  return null;
}

/** In-character acknowledgement when a cat LEARNS a fact about the player. */
const FACT_ACKS: Record<string, string[]> = {
  "i-am-training": ["Ah — training. Mind your mentor and mind the code; the rest follows.", "Training, is it? Then I'll expect quieter steps next time we share a border."],
  "i-am-new": ["New to the forest? Then keep your ears open and your tail out of the Thunderpath.", "So that's the wind under your paws. Welcome to the wild, such as it is."],
  "i-was-kittypet": ["A kittypet, out here? The forest will test that softness. It tests everyone.", "Kittypet-born. Some of the Clan's finest started softer than they look."],
  "i-am-warrior": ["A warrior. Then you know what the code costs — good.", "A warrior, come to talk. The forest must be quiet today."],
  "i-am-medicine": ["A medicine cat? Then we speak the same quiet language. Herbs and patience.", "Medicine cat — the Clan's memory. I'll remember you said so."],
  "i-am-loner": ["A loner. Free and hungry, as the saying goes.", "Loner, hmm. The forest doesn't care what you call yourself."],
};

/** Human-readable labels for remembered facts (LLM context + recall). */
export const FACT_LABELS: Record<string, string> = {
  "i-am-training": "the player is training to be a warrior",
  "i-am-new": "the player is new to the forest",
  "i-was-kittypet": "the player was born a kittypet",
  "i-am-warrior": "the player is a warrior",
  "i-am-medicine": "the player is training as a medicine cat",
  "i-am-loner": "the player is a loner",
};
export function recallFor(factId: string): string {
  const r: Record<string, string> = {
    "i-am-training": "How's the training coming along, by the way?",
    "i-am-new": "Still finding your paws out here?",
    "i-am-warrior": "How are your duties sitting with you these days?",
    "i-am-medicine": "How go the herbs these days?",
    "i-was-kittypet": "The soft life still calling you? No? Good.",
    "i-am-loner": "Still wandering?",
  };
  return r[factId] ?? "";
}

/** Per-character texture lines woven into some replies (Book 1 flavored). */
const FLAVOR: Record<string, string[]> = {
  bluestar: ["The Clan comes first, always.", "I have led this Clan through harder leaf-bares.", "StarClan sees our choices."],
  lionheart: ["A warrior's word is his claw-mark.", "The code is not a suggestion, friend.", "Train hard, eat well, sleep deeper."],
  tigerclaw: ["Weakness is a choice. Don't make it.", "I smell fear on most cats. Not on you. Yet.", "Stay out of my way and we'll get along."],
  whitestorm: ["Strength and patience — both matter here.", "Tigerclaw judges fast. Give cats time instead.", "Walk the borders before you judge them."],
  spottedleaf: ["Mind where you tread — the marigold is drying.", "StarClan sends what dreams they choose.", "Herbs heal the body. Time heals the rest."],
  graypaw: ["Race you to the Tallrock — loser eats dust!", "Wait till you taste fresh-kill. Pellets are an insult.", "Bluestar named ME first, you know. Well — after you."],
  ravenpaw: ["...keep your voice down. Please.", "I was there. I saw— no. Forget I said anything.", "Tigerclaw watches. He always watches."],
  dustpaw: ["Kittypets stay fat and lazy. Prove me wrong.", "Try to keep up, if you can.", "Tigerclaw says real warriors earn their name in battle."],
  sandpaw: ["Don't just stand there blinking.", "Fine — you're not as hopeless as you look.", "In ThunderClan we earn our place, paw by paw."],
  longtail: ["I remember scents AND scores, kittypet.", "I don't need a battle to prove myself. But I'd take one."],
  yellowfang: ["I'm old, I'm hungry, and I'm not in the mood.", "A medicine cat's debts are her own.", "Don't thank me. Just don't get in my way."],
  smudge: ["Henry says the forest cats eat bones! ...Right?", "Come back before dark, Rusty. The forest isn't for house cats.", "I dreamed you were a fire blazing through the trees. Silly... right?"],
  princess: ["Oh! You startled me.", "My Twolegs brush me every day, you know.", "Is Smudge eating well? Tell him I asked."],
  henry: ["I once jumped the WHOLE fence in one leap.", "The wildest thing out there is a fat pigeon.", "Pellets at dawn, dinner at six. What more could a cat want?"],
  crookedstar: ["The river gives, and the river takes.", "My jaw never stopped me. Neither will your doubts."],
  oakheart: ["Sunningrocks belongs to RiverClan — whatever they tell their apprentices.", "A RiverClan warrior fights wet and wins dry."],
  tallstar: ["The moor is open and the sky is wide.", "A WindClan cat trusts its legs above all."],
  brokenstar: ["My apprentices are made warriors before six moons. Weakness is a choice.", "The pines swallow intruders whole."],
  barley: ["The barn provides. The hay doesn't judge, and neither do I.", "Barn mice — fat, slow, and abundant."],
};

// ---------------------------------------------------------------------------
// In-character chat: the player types, the cat answers
// ---------------------------------------------------------------------------

function seedPick2<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

/** Weave this cat's own texture line into an answer so two cats never read
 *  identically — even when they share a rank-shaped base line. */
function withFlavorText(p: CharacterProfile, base: string, seed: number): string {
  const bank = FLAVOR[p.id];
  if (!bank || bank.length === 0) return base;
  return `${base} ${pick(bank, seed + 11)}`;
}

/**
 * Ravenpaw's Sunningrocks secret — bond-gated honesty. Returns null when the
 * topic isn't the secret (so other questions fall through to normal answers).
 */
function ravenpawSecret(topic: Topic, ctx: DialogueContext, seed: number): string | null {
  if (topic !== "redtail" && topic !== "sunningrocks") return null;
  const bond = ctx.bonds["ravenpaw"] ?? 0;
  if (bond < 2 || ctx.storyStep < 15) {
    return pick(["I— I was there. I saw— no. I've said too much already.", "...keep your voice down. Please. Not here."], seed);
  }
  return "You want the truth? Tigerclaw killed Redtail. Not Oakheart — Tigerclaw. Now you carry it too. Don't make me say it again.";
}

/**
 * Produce the NPC's in-character reply to a free-typed message.
 * Deterministic, knowledge-gated, timeline-safe. Returns null when the
 * optional server AI layer should be consulted instead (never blocks).
 */
export function npcChatReply(npcId: string, message: string, ctx: DialogueContext): { text: string; learn?: string; fact?: string; effect?: "bond" | "learn" } {
  const p = profileFor(npcId);
  const msg = message.trim();
  const seed = seedFor(p, msg, ctx);
  const topic = classifyTopic(msg);

  // --- 1) greeting / smalltalk: cheap warmth, no knowledge needed ----------
  if (topic === "greeting" || topic === "smalltalk") {
    const bank = FLAVOR[p.id];
    if (bank) return { text: pick(bank, seed) };
    return { text: pick(GREETINGS[p.voice.stance], seed) };
  }

  // --- 1.5) facts the player TOLD this cat: remember + acknowledge ---------
  const fact = detectPlayerFact(msg);
  if (fact) {
    const ack = seedPick2(FACT_ACKS[fact] ?? ["I'll remember that."], seed);
    return { text: ack, fact };
  }
  // did the player ASK something that touches a remembered fact?
  const remembered = (ctx.facts ?? []).map((f) => {
    const i = f.indexOf(":");
    return i > 0 ? { npc: f.slice(0, i), fact: f.slice(i + 1) } : null;
  }).filter((x) => x && x.npc === p.id);
  if (remembered.length > 0 && /how.?s|how is|remember|told you/i.test(msg)) {
    const f = remembered[0]!;
    const recall = recallFor(f.fact);
    if (recall) return { text: recall };
  }

  // --- 2) the future: no cat knows it, nobody breaks timeline --------------
  if (/\b(future|will you|what will|going to happen|prophecy.*happen|tomorrow.*will)\b/i.test(msg) && topic !== "prey") {
    return { text: pick(FUTURE_DEFLECTION[p.voice.stance], seed) };
  }

  // --- 2.5) identity questions: answered from the character database -------
  switch (topic) {
    case "identity-name":
      return { text: identityName(p, ctx, seed) };
    case "identity-age":
      return { text: identityAge(p, ctx, seed) };
    case "identity-rank":
      return { text: identityRank(p, ctx, seed) };
    case "identity-leader":
      return { text: identityLeader(p, ctx, seed) };
    case "identity-mentor":
      return { text: identityMentor(p, ctx, seed) };
    case "identity-family":
      return { text: identityFamily(p, ctx, seed) };
    case "identity-friends":
      return { text: identityFriends(p, ctx, seed) };
    case "identity-activity":
      return { text: withFlavorText(p, identityActivity(p, ctx, seed), seed) };
    case "opinion": {
      // which cat is the player asking about? scan the message for names
      const NAMES: [string, RegExp][] = [
        ["bluestar", /bluestar/i], ["tigerclaw", /tigerclaw/i], ["graypaw", /graypaw/i],
        ["ravenpaw", /ravenpaw/i], ["lionheart", /lionheart/i], ["whitestorm", /whitestorm/i],
        ["spottedleaf", /spottedleaf/i], ["yellowfang", /yellowfang/i], ["dustpaw", /dustpaw/i],
        ["sandpaw", /sandpaw/i], ["longtail", /longtail/i], ["darkstripe", /darkstripe/i],
        ["redtail", /redtail/i], ["oakheart", /oakheart/i], ["firepaw", /firepaw/i],
        ["rusty", /\brusty\b/i], ["smudge", /smudge/i], ["princess", /princess/i],
        ["barley", /barley/i], ["crookedstar", /crookedstar/i], ["tallstar", /tallstar/i],
        ["brokenstar", /brokenstar/i],
      ];
      for (const [tid, re] of NAMES) {
        if (re.test(msg)) {
          if (p.id === "ravenpaw" && (tid === "redtail" || tid === "tigerclaw")) {
            // the secret surfaces through opinions about Redtail or Tigerclaw too
            const secret = ravenpawSecret("redtail", ctx, seed);
            if (secret) return { text: secret };
          }
          const o = opinionOf(p, tid, ctx, seed);
          if (o) return { text: o };
          break;
        }
      }
      // no cat named: opinions about the CLAN itself get rank-shaped answers
      // (a leader does not shrug "never heard of it" about their own Clan)
      if (/clan/i.test(msg)) {
        return { text: answerFor("clan", p, ctx, seed) };
      }
      return { text: pick(DONT_KNOW[p.voice.stance], seed) };
    }
  }
  const gate = topicAllowed(topic, p, ctx);
  if (!gate.ok) {
    if (gate.why === "timeline") {
      // the event hasn't happened yet in this timeline: the cat genuinely
      // cannot know about it — respond as if the words mean nothing.
      // EXCEPTION: Ravenpaw deflects the Sunningrocks/Redtail questions with
      // his own nervous lines (in character), never a generic shrug.
      if (p.id === "ravenpaw" && (topic === "redtail" || topic === "sunningrocks")) {
        return { text: ravenpawSecret(topic, ctx, seed)! };
      }
      return { text: pick(DONT_KNOW[p.voice.stance], seed) };
    }
    // this cat would not understand or would refuse
    if (topic === "starclan") {
      // reuse the knowledge system: a Twolegplace cat gets confusion +
      // learns the flag so it can remember being told (per-NPC, never global)
      const star = starClanReply(p, ctx);
      return { text: star.text, learn: star.learn, effect: star.learn ? "learn" : undefined };
    }
    if (topic === "code" || topic === "herbs" || topic === "clan") {
      return { text: pick(DONT_KNOW[p.voice.stance], seed) };
    }
    return { text: pick(REFUSALS[p.voice.stance], seed) };
  }

  // --- 4) private-but-known topics: wary cats still deflect ----------------
  if ((topic === "redtail" || topic === "sunningrocks") && p.id === "ravenpaw") {
    const secret = ravenpawSecret(topic, ctx, seed);
    if (secret) return { text: secret };
  }
  if (topic === "sunningrocks" && p.id === "tigerclaw") {
    return { text: pick(["Redtail died a warrior's death. That is all any cat needs to know.", "Watch your tone, kittypet. Redtail's memory is not yours to question."], seed) };
  }
  if (topic === "redtail" && (p.id === "bluestar" || p.id === "lionheart")) {
    return { text: pick(["Redtail was the finest deputy a Clan could ask for. We mourn him.", "Redtail fell at Sunningrocks, defending our ground. The Clan carries on — because he would demand it."], seed) };
  }

  // --- 5) topic answers, shaped by rank + Clan + knowledge -----------------
  return { text: answerFor(topic, p, ctx, seed) };
}

const GREETINGS: Record<string, string[]> = {
  warm: ["Well met. The day's hunting was good — I hope yours was too.", "Hello! Sit, share tongues a moment."],
  curious: ["Oh — hello. What brings you my way?", "Well now. Look who it is."],
  wary: ["Hm. You again.", "Speak. I'm listening."],
  hostile: ["You. What now.", "Make it quick."],
  gruff: ["Hmph. What do you want.", "If this is about the weather, no."],
};

/** Rank/Clan/knowledge-shaped topical answers (concise, in-character). */
function answerFor(topic: Topic, p: CharacterProfile, ctx: DialogueContext, seed: number): string {
  const rank = p.rank.toLowerCase();
  const flavor = FLAVOR[p.id] ? pick(FLAVOR[p.id], seed + 5) : "";
  const isLeader = rank.includes("leader");
  const isDeputy = rank.includes("deputy");
  const isMed = rank.includes("medicine");
  const isApprentice = rank.includes("apprentice");
  const isKittypet = p.clan === "kittypet";

  // weave this cat's own texture line into shared answers so two cats with
  // the same rank pool NEVER read identically (always append for cats that
  // have a flavor bank — seeds differ per cat via seedFor's id+msg hash)
  const withFlavor = (base: string): string =>
    FLAVOR[p.id] ? `${base} ${pick(FLAVOR[p.id], seed + 11)}` : base;

  switch (topic) {
    case "starclan":
      return starClanReply(p, ctx).text;
    case "clan":
      if (p.id === "yellowfang") {
        return pick(["I don't belong to your Clan — and that's all you need to know.", "My Clan? Hah. You couldn't afford the answer."], seed);
      }
      if (isLeader) return pick(["The Clan is fed, guarded, and watchful. That is a leader's whole report.", "ThunderClan endures. That is the whole victory, season after season."], seed);
      if (isDeputy) return pick(["Patrols are out. Borders hold. The Clan is steady.", "The dawn patrol reported no trouble. Feed the elders first."], seed);
      if (isKittypet) return pick(["Clans? You mean those forest cats? Henry says they fight all night.", "I keep to my garden. Clans are forest business."], seed);
      return withFlavor(pick(["The Clan holds. That's the whole victory.", "We're fed, we're strong, we're here. What else matters?"], seed));
    case "patrol":
      if (isDeputy || isLeader) return pick(["Walk the border with the next patrol — fresh markers, sharp eyes.", "I'll set you with the evening patrol. Keep your paws off the Thunderpath."], seed);
      if (isApprentice) return pick(["I only just started patrols myself. Sandpaw says I walk too loud.", "Ask the deputy — patrols are their business, not mine."], seed);
      return withFlavor(pick(["The markers need refreshing along the far edge.", "Border's quiet. Too quiet, some say. I say quiet is GOOD."], seed));
    case "prey":
      if (isKittypet) return pick(["You CATCH them? With your mouth? Barbaric. Impressive, but barbaric.", "The street has pigeons. They're mine. All of them. In theory."], seed);
      if (isApprentice) return pick(["I pounced a mouse this big! Well... nearly this big.", "Fresh-kill beats pellets any day. ANY day."], seed);
      return withFlavor(pick(["Prey runs well this season. The forest provides — if you stalk quiet.", "Squirrel by the old oak, if your belly's faster than your pride."], seed));
    case "training":
      if (isApprentice) return pick(["Battle training at the Sandy Hollow today. Dustpaw says I fight like a badger — compliment, right?", "My mentor says keep your tail still when you stalk. Easier said than done!"], seed);
      if (rank.includes("warrior") || isDeputy) return pick(["I could show you the hunter's crouch. Low belly, still tail, patience.", "Training never ends — the forest changes every day."], seed);
      return pick(["I'm past training, young one. My joints remember every move though.", "Watch the apprentices stumble. Then do better."], seed);
    case "herbs":
      if (isMed) return pick(["Cobweb stops bleeding, poppy seed eases pain, marigold fights infection. Learn them — they save lives.", "The herb store runs low before leaf-bare. I must gather more."], seed);
      return pick(["Ask the medicine cat — herbs are their craft, not mine.", "For wounds? Chew cobweb on it and see the medicine cat. That's the whole of my wisdom."], seed);
    case "territory":
      if (isKittypet) return pick(["Beyond the fence? Trees, mostly. And rumors.", "I watch the forest from the window. That's close enough for me."], seed);
      return pick(["Fourtrees for the Gatherings, the river east, the Thunderpath north. Learn the map with your nose.", "This ground feeds us, so we guard it. Simple as prey."], seed);
    case "weather":
      return pick(["Rain keeps the prey deep in their burrows. Best wait it out under cover.", "Clear skies. A good day to be out among the trees.", "Wind from the moor today. It carries rabbit scent."], seed);
    case "leaders":
      if (isLeader) return pick(["A leader's nine lives are for the Clan, not for the cat.", "I carry this Clan in every decision. It is heavier than prey — and warmer."], seed);
      if (isKittypet) return pick(["Leaders? Out there? Henry says they have NINE lives. Nonsense. Probably."], seed);
      return pick(["Bluestar has led us through hard seasons. We'd follow her into fire.", "The leader speaks with StarClan behind every word."], seed);
    case "redtail":
      return withFlavor(pick(["Redtail was the finest deputy a Clan could ask for. We mourn him.", "Redtail fell defending our ground. The Clan carries on."], seed));
    case "sunningrocks":
      return withFlavor(pick(["Sunningrocks is worth more than its stones. Whoever holds it hunts the river bank at leisure.", "The rocks belong to ThunderClan. RiverClan disagrees — loudly."], seed));
    case "shadowclan":
      return pick(["ShadowClan scent past the Thunderpath is never good news.", "Keep clear of the pines. Their cats fight last — when you've already lost."], seed);
    case "code":
      return pick(["The code asks more of us than any Twoleg ever could. We defend the Clan with our lives.", "A warrior's first life belongs to the Clan. Learn the code before you quote it."], seed);
    case "twolegs":
      if (isKittypet) return pick(["Twolegs aren't so bad — mine brushes me and feeds me at six.", "You call them monsters; I call them breakfast-bringers."], seed);
      return pick(["Twolegs and their monsters... keep your distance, and keep your wits.", "Their traps took Halftail's tail. Respect the danger."], seed);
    case "kittypet-life":
      if (isKittypet) return pick(["A warm windowsill is the finest thing in the world. Ask any cat that has one.", "The bowl comes at dawn and dinner at six. What more could a cat want?"], seed);
      return pick(["Kittypets? Soft-pawed and well fed. Some are braver than they look, I'll admit.", "I was a kittypet once too — if you believe the gossip. Don't."], seed);
    case "player":
      return pick(["You? You smell of Twolegs still, but your paws are steady.", "You're the one every cat's whispering about. Make it worth their breath."], seed);
    case "gossip":
      return flavor || pick([
        "The elders want stories tonight. Kits crowded the nursery all morning.",
        "Rumors travel faster than rabbits here. Half are even true.",
        "Fresh scent along the stream — fox, maybe. Keep your ears open.",
      ], seed);
    case "unknown":
    default:
      return flavor || pick(DONT_KNOW[p.voice.stance], seed);
  }
}

// ---------------------------------------------------------------------------
// Ask menus: 3–5 short, context-valid questions per NPC
// ---------------------------------------------------------------------------

interface AskCandidate {
  id: string;
  label: string;
  /** Only offer when this predicate passes. */
  when?: (p: CharacterProfile, ctx: DialogueContext) => boolean;
  /** Weight: higher surfaces first when trimming to the max. */
  weight: number;
  reply: (p: CharacterProfile, ctx: DialogueContext) => { text: string; learn?: string; effect?: "bond" | "learn" };
}

/** The three dynamic groups from the spec: About You / Current Situation / character-specific. */
const GROUP_ASKS: AskCandidate[] = [
  { id: "g-name", label: "What's your name?", weight: 15, reply: (p, ctx) => ({ text: identityName(p, ctx, seedFor(p, "g-name", ctx)) }) },
  { id: "g-age", label: "How old are you?", weight: 12, reply: (p, ctx) => ({ text: identityAge(p, ctx, seedFor(p, "g-age", ctx)) }) },
  { id: "g-clan", label: "What Clan are you in?", weight: 12, when: (p) => p.clan !== "kittypet" && p.clan !== "rogue", reply: (p, ctx) => ({ text: identityClan(p, ctx, seedFor(p, "g-clan", ctx)) }) },
  { id: "g-rank", label: "What rank are you?", weight: 10, when: (p) => p.clan !== "kittypet" && p.clan !== "rogue", reply: (p, ctx) => ({ text: identityRank(p, ctx, seedFor(p, "g-rank", ctx)) }) },
  { id: "g-activity", label: "What are you doing?", weight: 16, reply: (p, ctx) => ({ text: identityActivity(p, ctx, seedFor(p, "g-activity", ctx)) }) },
  { id: "g-going", label: "Where are you going?", weight: 8, reply: (p, ctx) => ({ text: identityActivity(p, ctx, seedFor(p, "g-going", ctx)) }) },
  { id: "g-friends", label: "Who are your friends?", weight: 7, reply: (p, ctx) => ({ text: identityFriends(p, ctx, seedFor(p, "g-friends", ctx)) }) },
  { id: "g-leader", label: "Who is your leader?", weight: 8, when: (p) => p.clan !== "kittypet" && p.clan !== "rogue", reply: (p, ctx) => ({ text: identityLeader(p, ctx, seedFor(p, "g-leader", ctx)) }) },
];

const SHARED_ASKS: AskCandidate[] = [
  {
    id: "clan-news", label: "What's happening in the Clan?", weight: 10,
    when: (p) => p.clan !== "kittypet" && p.clan !== "rogue",
    reply: (p, ctx) => ({ text: answerFor("clan", p, ctx, seedFor(p, "clan-news", ctx)) }),
  },
  {
    id: "prey", label: "How's the prey running?", weight: 8,
    when: (p) => p.clan !== "kittypet",
    reply: (p, ctx) => ({ text: answerFor("prey", p, ctx, seedFor(p, "prey", ctx)) }),
  },
  {
    id: "weather", label: "What about this weather?", weight: 6,
    reply: (p, ctx) => ({ text: answerFor("weather", p, ctx, seedFor(p, "weather", ctx)) }),
  },
  {
    id: "territory", label: "Where does our territory end?", weight: 7,
    when: (p) => p.clan !== "kittypet",
    reply: (p, ctx) => ({ text: answerFor("territory", p, ctx, seedFor(p, "territory", ctx)) }),
  },
  {
    id: "starclan", label: "Tell me about StarClan.", weight: 13,
    reply: (p, ctx) => {
      const r = starClanReply(p, ctx);
      return { text: r.text, learn: r.learn, effect: r.learn ? "learn" : undefined };
    },
  },
  {
    id: "twolegs", label: "What do you know about Twolegs?", weight: 4,
    reply: (p, ctx) => ({ text: answerFor("twolegs", p, ctx, seedFor(p, "twolegs", ctx)) }),
  },
];

/** Hand-authored per-character asks (Book 1 flavored, character-specific). */
const PERSONAL_ASKS: Record<string, AskCandidate[]> = {
  bluestar: [
    { id: "patrol", label: "Is there a patrol I can join?", weight: 12, reply: () => ({ text: "Speak with the deputy — patrol duty is assigned at dawn and dusk. Walk carefully, and come back with news, not wounds.", effect: "bond" }) },
    { id: "need", label: "Do you need anything?", weight: 11, reply: () => ({ text: "Rest. Vigilance. A Clan that trusts one another. The first two you may bring me; the third we build together.", effect: "bond" }) },
    { id: "code", label: "What does the warrior code mean to you?", weight: 9, when: (p, ctx) => knows(p, "warrior-code", ctx), reply: () => ({ text: "The code is the Clan's spine. Bend it and the Clan bends with it. I have broken it once — and paid in ways no cat should." }) },
  ],
  lionheart: [
    { id: "train", label: "Will you train with me?", weight: 12, when: (p) => p.id !== "lionheart" ? true : true, reply: () => ({ text: "Gladly. Low crouch, weight on your haunches — we'll drill until your paws know the moves without asking.", effect: "bond" }) },
    { id: "deputy", label: "What makes a good deputy?", weight: 9, reply: () => ({ text: "Serve the Clan before yourself. Know every cat by name, every border by scent, and never ask a patrol to go where you won't." }) },
  ],
  tigerclaw: [
    { id: "fight", label: "Teach me to fight.", weight: 11, reply: () => ({ text: "You want to learn from me? Show up at dawn. Come late, and don't come at all." }) },
    { id: "weak", label: "Do you think I'm weak?", weight: 8, reply: () => ({ text: pick(["Weakness is a choice. Stop choosing it.", "You smell of Twolegs. Prove me wrong and I'll say so — once."], 1) }) },
  ],
  whitestorm: [
    { id: "advice", label: "Any advice for a new cat?", weight: 11, reply: () => ({ text: "Strength and patience — both matter here. Listen twice as much as you speak, and let your hunting speak for you.", effect: "bond" }) },
    { id: "tiger", label: "What's Tigerclaw's problem?", weight: 7, reply: () => ({ text: "He judges every cat by their first scrap. Earn his respect or ignore him — both work. The second is easier." }) },
  ],
  spottedleaf: [
    { id: "herbs", label: "Do you need any herbs?", weight: 12, reply: () => ({ text: "Marigold, if you pass the stream — the orange flowers, chewed for infection. And catmint if you're brave enough for Twolegplace.", effect: "bond" }) },
    { id: "injured", label: "Is anyone injured?", weight: 10, reply: () => ({ text: "No wounds today, thank StarClan. Keep it that way — the Thunderpath takes more than it gives." }) },
    { id: "watch", label: "What should I watch for?", weight: 9, reply: () => ({ text: "Green-cough in the elders when the damp comes. And ticks after the bracken — mouse-bile, not pride, is the cure." }) },
  ],
  graypaw: [
    { id: "trainfor", label: "What are you training for?", weight: 12, reply: () => ({ text: "Battle moves at the Sandy Hollow! Lionheart says my pounce lands crooked — it does NOT. Mostly." }) },
    { id: "huntwith", label: "Do you want to go hunting?", weight: 11, reply: () => ({ text: "Now you're talking! First one to catch something eats it — loser tells everyone it was training.", effect: "bond" }) },
    { id: "firepaw", label: "Seen Firepaw around?", weight: 8, when: (p, ctx) => ctx.mode === "story" ? ctx.storyStep >= 6 : true, reply: () => ({ text: "That's me and you both, kittypet-turned-apprentice! Wait — you mean you? Ha!" }) },
  ],
  ravenpaw: [
    { id: "ok", label: "Are you alright?", weight: 12, reply: () => ({ text: pick(["...I'm fine. I'm fine. Don't— don't tell Tigerclaw you asked.", "I'm... resting. Apprentices rest. That's allowed."], 2) }) },
    { id: "sight", label: "You look jumpy. What happened?", weight: 9, reply: () => ({ text: "Nothing. Nothing happened. I need to— I should check the elders' bedding. Goodbye." }) },
  ],
  dustpaw: [
    { id: "spar", label: "Spar with me?", weight: 10, reply: () => ({ text: "Try to keep up, kittypet. First throw wins — and I always win." }) },
    { id: "kittypet", label: "Why do you hate kittypets?", weight: 7, reply: () => ({ text: "Hate's a strong word. I don't TRUST soft paws to fight hard. Change my mind." }) },
  ],
  sandpaw: [
    { id: "crouch", label: "Show me the hunting crouch?", weight: 11, reply: () => ({ text: "Maybe I will. Belly low, tail down, weight BACK — now stop blinking and watch the mouse.", effect: "bond" }) },
  ],
  yellowfang: [
    { id: "food", label: "Are you hungry? There's fresh-kill.", weight: 12, reply: () => ({ text: "Hmph. If you're offering, I'm eating. Old cats don't turn down meals — or kindness. Don't tell anyone about the kindness.", effect: "bond" }) },
    { id: "hurt", label: "You're hurt. Let me help.", weight: 10, reply: () => ({ text: "I've had worse from fleas. But... cobweb, if you're insisting. Just this once." }) },
    { id: "clan", label: "Which Clan are you from?", weight: 8, reply: () => ({ text: "I don't belong to your Clan — and that's all you need to know." }) },
  ],
  smudge: [
    { id: "forest", label: "Is the forest really dangerous?", weight: 12, reply: () => ({ text: "Henry says the forest cats eat bones! And there are foxes. And BADGERS. You went out there on PURPOSE?" }) },
    { id: "twoleg", label: "How are your Twolegs?", weight: 9, reply: () => ({ text: "Same as ever — pellets at dawn, cuddles at dinner. Come sit on the fence, it's warm." }) },
    { id: "miss", label: "Do you miss Rusty?", weight: 10, when: (p, ctx) => ctx.player.clan === "thunderclan", reply: () => ({ text: "Every day. He'd sit with me at dusk and stare at the trees. Now he IS one of the trees, or whatever. Firepaw." }) },
  ],
  princess: [
    { id: "brother", label: "How is Smudge doing?", weight: 11, reply: () => ({ text: "Oh, he's sweet as ever — always talking about his friend who left. That's you, isn't it?" }) },
    { id: "birds", label: "See any good birds today?", weight: 8, reply: () => ({ text: "Two fat pigeons on the fence, and a robin that thinks it owns the flowerbed. I named him Gerald." }) },
  ],
  henry: [
    { id: "leap", label: "Is the fence-jump story true?", weight: 10, reply: () => ({ text: "ONE leap! Clean clearance! Ask anyone on this street — well, ask them the version I told." }) },
  ],
  barley: [
    { id: "mice", label: "Any barn mice to spare?", weight: 11, reply: () => ({ text: "Take a few — the barn provides. Fat, slow, and abundant, like Twolegs at a picnic.", effect: "bond" }) },
  ],
  crookedstar: [
    { id: "jaw", label: "What happened to your jaw?", weight: 9, reply: () => ({ text: "A tumble as a kit — a rock, a river, a crooked jaw. It never stopped me from becoming leader, and it won't stop you either." }) },
  ],
  tallstar: [
    { id: "run", label: "Will you run with me?", weight: 11, reply: () => ({ text: "Run with us once and your legs will never forget it. Catch your breath first — you'll need both.", effect: "bond" }) },
  ],
  oakheart: [
    { id: "rocks", label: "Whose are the Sunningrocks, really?", weight: 10, reply: () => ({ text: "RiverClan's — whatever ThunderClan tells its apprentices. Come fishing and see how we argue." }) },
  ],
};

const MAX_ASKS = 5; // spec: three to five questions at a time

/**
 * Build the compact "Ask [name]" submenu: up to 4 context-valid questions,
 * personal asks first, then shared ones, filtered by Clan/knowledge/timeline.
 */
export function buildAskMenu(npcId: string, ctx: DialogueContext): AskOption[] {
  const p = profileFor(npcId);
  const candidates: AskCandidate[] = [
    ...(PERSONAL_ASKS[p.id] ?? []),
    ...GROUP_ASKS,
    ...SHARED_ASKS,
  ];
  const valid: AskCandidate[] = [];
  for (const c of candidates) {
    // timeline/knowledge gate per ask's topic family — EXCEPT the StarClan
    // ask, which is the sanctioned teaching moment (starClanReply handles
    // both the confused and informed states, learning per-NPC)
    if (c.id === "starclan") { valid.push(c); continue; }
    const topicLike = classifyTopic(c.label);
    const gate = topicAllowed(topicLike === "unknown" ? "clan" : topicLike, p, ctx);
    if (!gate.ok) continue;
    if (c.when && !c.when(p, ctx)) continue;
    valid.push(c);
  }
  // dedupe, then surface the personal asks first (weight tiebreak), so the
  // menu leads with THIS cat's own questions instead of the generic pool
  const seen = new Set<string>();
  const out: AskOption[] = [];
  const personalSet = new Set((PERSONAL_ASKS[p.id] ?? []).map((c) => c.id));
  const ordered = [...valid].sort((a, b) => {
    const pa = personalSet.has(a.id) ? 1 : 0;
    const pb = personalSet.has(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.weight - a.weight;
  });
  for (const c of ordered) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const r = c.reply(p, ctx);
    out.push({ id: c.id, label: c.label, reply: r.text, effect: r.effect, learn: r.learn, weight: c.weight });
    if (out.length >= MAX_ASKS) break;
  }
  return out;
}
